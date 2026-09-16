"use client";

import { useCallback, useRef, useState } from "react";
import { useBook } from "@/components/layout/BookProvider";
import { localWhatIf } from "@/lib/whatIf";
import type { PreTradeWhatIfResult, WhatIfForm } from "@/types/workbench";

export function useWorkbench() {
  const { workbench, source, origin } = useBook();
  const [whatIf, setWhatIf] = useState<PreTradeWhatIfResult | null>(null);
  const [whatIfBusy, setWhatIfBusy] = useState(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const seq = useRef(0);
  const debounce = useRef<number | null>(null);

  const load = useCallback(async () => workbench, [workbench]);

  const runWhatIf = useCallback(
    async (form: WhatIfForm) => {
      const ticket = ++seq.current;
      setWhatIfBusy(true);
      setWhatIfError(null);
      setWhatIf(localWhatIf(workbench, form));
      if (ticket === seq.current) setWhatIfBusy(false);
    },
    [workbench],
  );

  const scheduleWhatIf = useCallback(
    (form: WhatIfForm) => {
      if (debounce.current) window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(() => {
        void runWhatIf(form);
      }, 180);
    },
    [runWhatIf],
  );

  const commitWhatIf = useCallback(
    async (form: WhatIfForm) => {
      setCommitting(true);
      setWhatIfError(null);
      setWhatIf(localWhatIf(workbench, form));
      setToast(origin === "import" ? "已按导入账本完成试算（未连接交易引擎）" : "演示模式：试算结果已按当前账本计算");
      window.setTimeout(() => setToast(null), 4000);
      setCommitting(false);
      return true;
    },
    [workbench, origin],
  );

  return {
    data: workbench,
    source,
    error: null as string | null,
    live: "idle" as const,
    load,
    whatIf,
    whatIfBusy,
    whatIfError,
    committing,
    toast,
    setToast,
    runWhatIf: scheduleWhatIf,
    commitWhatIf,
    setWhatIf,
  };
}
