import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ActionsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Read only</CardTitle>
        <CardDescription>This public monitor does not send transactions.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Keeper drips and other actions are not available here, including when{" "}
        <span className="font-mono">ACTIONS_ENABLED</span> is set. The peg tables are the whole product.
      </CardContent>
    </Card>
  );
}
