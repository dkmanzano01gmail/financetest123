import { useState } from "react";
import { Calculator, Delete } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Operation = "+" | "−" | "×" | "÷";

const operations: Operation[] = ["÷", "×", "−", "+"];

function parseDisplay(value: string) {
  return Number(value.replace(",", "."));
}

function formatResult(value: number) {
  if (!Number.isFinite(value)) return "Erro";
  return Number.parseFloat(value.toPrecision(12)).toString().replace(".", ",");
}

function calculate(left: number, right: number, operation: Operation) {
  if (operation === "+") return left + right;
  if (operation === "−") return left - right;
  if (operation === "×") return left * right;
  return right === 0 ? Number.NaN : left / right;
}

export function QuickCalculatorButton() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [pendingOperation, setPendingOperation] = useState<Operation | null>(null);
  const [replaceDisplay, setReplaceDisplay] = useState(false);

  function clear() {
    setDisplay("0");
    setStoredValue(null);
    setPendingOperation(null);
    setReplaceDisplay(false);
  }

  function inputDigit(digit: string) {
    setDisplay((current) => {
      if (replaceDisplay || current === "Erro") return digit;
      if (current === "0") return digit;
      if (current.replace("-", "").replace(",", "").length >= 12) return current;
      return `${current}${digit}`;
    });
    setReplaceDisplay(false);
  }

  function inputDecimal() {
    setDisplay((current) => {
      if (replaceDisplay || current === "Erro") return "0,";
      return current.includes(",") ? current : `${current},`;
    });
    setReplaceDisplay(false);
  }

  function backspace() {
    if (replaceDisplay || display === "Erro") return setDisplay("0");
    setDisplay((current) => (current.length > 1 ? current.slice(0, -1) : "0"));
  }

  function chooseOperation(operation: Operation) {
    const currentValue = parseDisplay(display);
    if (!Number.isFinite(currentValue)) return clear();

    if (storedValue !== null && pendingOperation && !replaceDisplay) {
      const result = calculate(storedValue, currentValue, pendingOperation);
      const formatted = formatResult(result);
      setDisplay(formatted);
      setStoredValue(Number.isFinite(result) ? result : null);
      setPendingOperation(Number.isFinite(result) ? operation : null);
    } else {
      setStoredValue(currentValue);
      setPendingOperation(operation);
    }
    setReplaceDisplay(true);
  }

  function showResult() {
    if (storedValue === null || !pendingOperation || replaceDisplay) return;
    const result = calculate(storedValue, parseDisplay(display), pendingOperation);
    setDisplay(formatResult(result));
    setStoredValue(null);
    setPendingOperation(null);
    setReplaceDisplay(true);
  }

  const expression =
    storedValue !== null && pendingOperation
      ? `${formatResult(storedValue)} ${pendingOperation}`
      : "Cálculo rápido";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Abrir calculadora"
        aria-label="Abrir calculadora"
        className="fixed bottom-[4.5rem] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-primary/20 bg-card text-primary shadow-lg transition-all hover:-translate-y-0.5 hover:bg-muted hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:bottom-[5rem] md:right-5"
      >
        <Calculator className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[22rem] rounded-2xl p-5 sm:max-w-[22rem]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Calculadora
            </DialogTitle>
            <DialogDescription>Faça cálculos rápidos sem sair da tela atual.</DialogDescription>
          </DialogHeader>

          <div className="mt-1 rounded-xl border bg-muted/35 p-4 text-right">
            <p className="h-5 text-sm text-muted-foreground">{expression}</p>
            <p
              className="mt-1 min-h-10 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-3xl font-semibold tabular-nums"
              aria-live="polite"
            >
              {display}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            <CalculatorKey label="C" onClick={clear} className="text-destructive" />
            <CalculatorKey label="0" onClick={() => inputDigit("0")} />
            <CalculatorKey
              label={<Delete className="h-4 w-4" />}
              ariaLabel="Apagar último número"
              onClick={backspace}
            />
            <CalculatorKey
              label="÷"
              onClick={() => chooseOperation("÷")}
              active={pendingOperation === "÷"}
              operation
            />

            {["7", "8", "9"].map((digit) => (
              <CalculatorKey key={digit} label={digit} onClick={() => inputDigit(digit)} />
            ))}
            <CalculatorKey
              label="×"
              onClick={() => chooseOperation("×")}
              active={pendingOperation === "×"}
              operation
            />

            {["4", "5", "6"].map((digit) => (
              <CalculatorKey key={digit} label={digit} onClick={() => inputDigit(digit)} />
            ))}
            <CalculatorKey
              label="−"
              onClick={() => chooseOperation("−")}
              active={pendingOperation === "−"}
              operation
            />

            {["1", "2", "3"].map((digit) => (
              <CalculatorKey key={digit} label={digit} onClick={() => inputDigit(digit)} />
            ))}
            <CalculatorKey
              label="+"
              onClick={() => chooseOperation("+")}
              active={pendingOperation === "+"}
              operation
            />

            <CalculatorKey label="00" onClick={() => inputDigit("00")} />
            <CalculatorKey label="0" onClick={() => inputDigit("0")} />
            <CalculatorKey label="," onClick={inputDecimal} />
            <CalculatorKey
              label="="
              onClick={showResult}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CalculatorKey({
  label,
  ariaLabel,
  onClick,
  active = false,
  operation = false,
  className = "",
}: {
  label: React.ReactNode;
  ariaLabel?: string;
  onClick: () => void;
  active?: boolean;
  operation?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel || (typeof label === "string" ? label : undefined)}
      onClick={onClick}
      className={`flex h-12 items-center justify-center rounded-xl border text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : operation
            ? "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
            : "bg-card hover:bg-muted"
      } ${className}`}
    >
      {label}
    </button>
  );
}
