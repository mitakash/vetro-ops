import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { actionsEnabled, dripMaxVusd, getPublicClient, privateKeyPresent } from "@/lib/chain";
import { VUSD, YIELD_DISTRIBUTOR, yieldDistributorAbi } from "@/lib/contracts";
import { publicError } from "@/lib/errors";
import { formatUnits } from "@/lib/quote-math";

export const DISTRIBUTOR_ROLE = keccak256(toBytes("DISTRIBUTOR_ROLE"));

export type DripCall = {
  to: Address;
  functionName: "approve" | "distribute";
  description: string;
  data: Hex;
};

export type DripContext = {
  actionsEnabled: boolean;
  privateKeyPresent: boolean;
  broadcastArmed: boolean;
  keeperAddress: Address | null;
  hasDistributorRole: boolean | null;
  balance: string | null;
  balanceRaw: string | null;
  maxAmount: string;
  notes: string[];
};

export type DripPlan = {
  ok: boolean;
  mode: "dry-run" | "broadcast";
  actionsEnabled: boolean;
  confirmBroadcast: boolean;
  keeperAddress: Address | null;
  hasDistributorRole: boolean | null;
  amount: { human: string; raw: string };
  balance: string | null;
  balanceRaw: string | null;
  allowanceRaw: string | null;
  sufficientBalance: boolean | null;
  calls: DripCall[];
  simulation: {
    approve: { ok: boolean; skipped?: boolean; error?: string };
    distribute: { ok: boolean; skipped?: boolean; error?: string };
  };
  broadcast: null | {
    approveTx: Hex | null;
    distributeTx: Hex | null;
    error?: string;
  };
  notes: string[];
};

const AMOUNT_PATTERN = /^\d+(\.\d{1,18})?$/;

export function parseDripAmount(input: string): bigint {
  const trimmed = input.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) {
    throw new Error("Amount must be a positive VUSD number with at most 18 decimals");
  }
  const amount = parseUnits(trimmed, 18);
  if (amount <= 0n) throw new Error("Amount must be greater than zero");
  const max = parseUnits(String(dripMaxVusd()), 18);
  if (amount > max) {
    throw new Error(`Amount exceeds DRIP_MAX_VUSD (${dripMaxVusd().toLocaleString("en-US")} VUSD)`);
  }
  return amount;
}

export function keeperAddressFromEnv(): Address | null {
  const raw = process.env.KEEPER_ADDRESS?.trim();
  if (!raw) return null;
  if (!isAddress(raw)) throw new Error("KEEPER_ADDRESS is not a valid address");
  return getAddress(raw);
}

function callsFor(amount: bigint): DripCall[] {
  return [
    {
      to: VUSD,
      functionName: "approve",
      description: "Allow the YieldDistributor to pull this VUSD amount.",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [YIELD_DISTRIBUTOR, amount],
      }),
    },
    {
      to: YIELD_DISTRIBUTOR,
      functionName: "distribute",
      description: "Pull VUSD and restart the linear drip. Requires DISTRIBUTOR_ROLE.",
      data: encodeFunctionData({
        abi: yieldDistributorAbi,
        functionName: "distribute",
        args: [amount],
      }),
    },
  ];
}

export async function getDripContext(): Promise<DripContext> {
  const enabled = actionsEnabled();
  const keyPresent = privateKeyPresent();
  const notes = safetyNotes(enabled, keyPresent);
  const maxAmount = dripMaxVusd().toLocaleString("en-US");
  let keeperAddress: Address | null = null;
  try {
    keeperAddress = keeperAddressFromEnv();
  } catch (error) {
    return {
      actionsEnabled: enabled,
      privateKeyPresent: keyPresent,
      broadcastArmed: false,
      keeperAddress: null,
      hasDistributorRole: null,
      balance: null,
      balanceRaw: null,
      maxAmount,
      notes: [...notes, publicError(error)],
    };
  }
  if (!keeperAddress) {
    return {
      actionsEnabled: enabled,
      privateKeyPresent: keyPresent,
      broadcastArmed: enabled && keyPresent,
      keeperAddress: null,
      hasDistributorRole: null,
      balance: null,
      balanceRaw: null,
      maxAmount,
      notes,
    };
  }
  const client = getPublicClient();
  const [balance, role] = await Promise.all([
    client.readContract({ address: VUSD, abi: erc20Abi, functionName: "balanceOf", args: [keeperAddress] }),
    client.readContract({
      address: YIELD_DISTRIBUTOR,
      abi: yieldDistributorAbi,
      functionName: "hasRole",
      args: [DISTRIBUTOR_ROLE, keeperAddress],
    }),
  ]);
  return {
    actionsEnabled: enabled,
    privateKeyPresent: keyPresent,
    broadcastArmed: enabled && keyPresent,
    keeperAddress,
    hasDistributorRole: role,
    balance: formatUnits(balance, 18, 2),
    balanceRaw: balance.toString(),
    maxAmount,
    notes,
  };
}

export async function planDrip(input: {
  amount: string;
  confirmBroadcast?: boolean;
}): Promise<DripPlan> {
  const amount = parseDripAmount(input.amount);
  const enabled = actionsEnabled();
  const keyPresent = privateKeyPresent();
  const confirm = input.confirmBroadcast === true;
  const wantBroadcast = enabled && keyPresent && confirm;
  const notes = safetyNotes(enabled, keyPresent);
  if (enabled && keyPresent && !confirm) {
    notes.push("Broadcast stayed off because confirmBroadcast was not set.");
  }
  const keeperAddress = keeperAddressFromEnv();
  const calls = callsFor(amount);
  const plan: DripPlan = {
    ok: true,
    mode: "dry-run",
    actionsEnabled: enabled,
    confirmBroadcast: confirm,
    keeperAddress,
    hasDistributorRole: null,
    amount: { human: formatUnits(amount, 18, 6), raw: amount.toString() },
    balance: null,
    balanceRaw: null,
    allowanceRaw: null,
    sufficientBalance: null,
    calls,
    simulation: {
      approve: { ok: false, skipped: true },
      distribute: { ok: false, skipped: true },
    },
    broadcast: null,
    notes,
  };

  if (!keeperAddress) {
    if (wantBroadcast) {
      throw new Error("KEEPER_ADDRESS is required before a drip can be broadcast");
    }
    plan.notes.push("Set KEEPER_ADDRESS to check the VUSD balance and DISTRIBUTOR_ROLE. Calldata is still encoded.");
    return plan;
  }

  const client = getPublicClient();
  const [balance, allowance, role] = await Promise.all([
    client.readContract({ address: VUSD, abi: erc20Abi, functionName: "balanceOf", args: [keeperAddress] }),
    client.readContract({
      address: VUSD,
      abi: erc20Abi,
      functionName: "allowance",
      args: [keeperAddress, YIELD_DISTRIBUTOR],
    }),
    client.readContract({
      address: YIELD_DISTRIBUTOR,
      abi: yieldDistributorAbi,
      functionName: "hasRole",
      args: [DISTRIBUTOR_ROLE, keeperAddress],
    }),
  ]);
  plan.balanceRaw = balance.toString();
  plan.balance = formatUnits(balance, 18, 2);
  plan.allowanceRaw = allowance.toString();
  plan.sufficientBalance = balance >= amount;
  plan.hasDistributorRole = role;
  if (!plan.sufficientBalance) {
    plan.notes.push("Keeper VUSD balance is below the requested drip.");
  }
  if (!role) {
    plan.notes.push("This keeper does not hold DISTRIBUTOR_ROLE. distribute() would revert.");
  }

  try {
    await client.simulateContract({
      address: VUSD,
      abi: erc20Abi,
      functionName: "approve",
      args: [YIELD_DISTRIBUTOR, amount],
      account: keeperAddress,
    });
    plan.simulation.approve = { ok: true };
  } catch (error) {
    plan.simulation.approve = { ok: false, error: publicError(error) };
  }

  if (allowance >= amount) {
    try {
      await client.simulateContract({
        address: YIELD_DISTRIBUTOR,
        abi: yieldDistributorAbi,
        functionName: "distribute",
        args: [amount],
        account: keeperAddress,
      });
      plan.simulation.distribute = { ok: true };
    } catch (error) {
      plan.simulation.distribute = { ok: false, error: publicError(error) };
    }
  } else {
    plan.simulation.distribute = {
      ok: false,
      skipped: true,
      error: "Skipped until the keeper allowance covers this amount. Approve calldata is ready.",
    };
  }

  if (wantBroadcast) {
    throw new Error("Broadcast is disabled on the public peg monitor");
  }
  return plan;
}

function safetyNotes(enabled: boolean, keyPresent: boolean): string[] {
  const notes = [
    "The public peg monitor does not broadcast. ACTIONS_ENABLED cannot arm a transaction from this app.",
    "The private key belongs in the host environment (Vercel Sensitive env or a local untracked file). It is never returned by this API.",
    "distribute() transfers VUSD from the keeper and is restricted to DISTRIBUTOR_ROLE.",
  ];
  if (!enabled) notes.push("ACTIONS_ENABLED is not true, so this response cannot broadcast.");
  if (enabled && !keyPresent) notes.push("ACTIONS_ENABLED is true, but KEEPER_PRIVATE_KEY is missing, so this response cannot broadcast.");
  return notes;
}
