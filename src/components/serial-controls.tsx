import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { BaudRate } from "@/hooks/use-serial-monitor";

type SerialControlsProps = {
  baudRate: BaudRate;
  baudRates: readonly BaudRate[];
  canConnect: boolean;
  canDisconnect: boolean;
  hasLogEntries: boolean;
  isBusy: boolean;
  onBaudRateChange: (baudRate: BaudRate) => void;
  onClearLog: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSaveLog: () => void;
};

export function SerialControls({
  baudRate,
  baudRates,
  canConnect,
  canDisconnect,
  hasLogEntries,
  isBusy,
  onBaudRateChange,
  onClearLog,
  onConnect,
  onDisconnect,
  onSaveLog,
}: SerialControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm font-medium text-foreground">
        Baud rate
        <NativeSelect
          value={baudRate}
          disabled={isBusy || canDisconnect}
          onChange={(event) => onBaudRateChange(Number(event.currentTarget.value) as BaudRate)}
        >
          {baudRates.map((rate) => (
            <NativeSelectOption key={rate} value={rate}>
              {rate}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <Button type="button" disabled={!canConnect || isBusy} onClick={onConnect}>
        接続
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!canDisconnect || isBusy}
        onClick={onDisconnect}
      >
        切断
      </Button>
      <Button type="button" variant="outline" disabled={!hasLogEntries} onClick={onSaveLog}>
        保存
      </Button>
      <Button type="button" variant="outline" disabled={!hasLogEntries} onClick={onClearLog}>
        ログ消去
      </Button>
    </div>
  );
}
