import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionStatus } from "@/hooks/use-serial-monitor";

type StatusPanelProps = {
  errorMessage: string | null;
  isSerialSupported: boolean;
  logEntryCount: number;
  maxLogEntries: number;
  status: ConnectionStatus;
};

const statusLabels = {
  idle: "未接続",
  connecting: "接続中",
  connected: "接続済み",
  disconnecting: "切断中",
} satisfies Record<ConnectionStatus, string>;

export function StatusPanel({
  errorMessage,
  isSerialSupported,
  logEntryCount,
  maxLogEntries,
  status,
}: StatusPanelProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>状態</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">接続</dt>
            <dd className="mt-1 font-medium text-foreground">{statusLabels[status]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">受信ログ</dt>
            <dd className="mt-1 font-medium text-foreground">
              {logEntryCount} / {maxLogEntries} 行
            </dd>
          </div>
        </dl>

        {!isSerialSupported && (
          <Alert>
            <AlertTitle>Web Serial API 非対応</AlertTitle>
            <AlertDescription>
              このブラウザは Web Serial API に対応していません。Chrome または Edge
              の最新版で開いてください。
            </AlertDescription>
          </Alert>
        )}

        {errorMessage && (
          <Alert variant="destructive">
            <AlertTitle>エラー</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
