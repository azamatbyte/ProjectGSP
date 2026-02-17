import React, { useMemo, useCallback, useRef, useEffect } from "react";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

/**
 * Qayta foydalaniladigan RangePicker wrapperi.
 * - Har bir sahifa o'zining setState (setSearch va h.k.) funksiyasini uzatadi
 * - startKey/endKey orqali state dagi maydon nomlarini dinamik beradi
 * - placeholder, format, picker, tabIndex, style va hk. bevosita uzatiladi
 */
const DateRangeFilter = ({
  value,
  onChange,
  setState, // masalan: setSearch
  state, // masalan: search
  startKey,
  endKey,
  resetPage = () => {}, // masalan: setPageNumber(1)
  picker = "date",
  format,
  placeholder,
  allowClear = true,
  tabIndex,
  style,
  autoMask = true,
  autoFocus = false,
  ...rest
}) => {
  const wrapperRef = useRef(null);
  const backspaceOverDotRef = useRef(false);

  // dd.mm.yyyy maska qo'llash
  useEffect(() => {
    if (!autoMask || picker !== "date") return;
    const root = wrapperRef.current;
    if (!root) return;

    const inputs = root.querySelectorAll("input");
    if (!inputs || inputs.length === 0) return;

    const formatToMask = (raw) => {
      const digits = (raw || "").replace(/\D/g, "").slice(0, 8);
      const len = digits.length;
      const day = digits.slice(0, 2);
      const month = digits.slice(2, 4);
      const year = digits.slice(4, 8);
      let masked = "";
      if (len <= 2) {
        // dd → dd.
        masked = day + (len === 2 ? "." : "");
        return masked;
      }
      // dd.mm
      masked = day + "." + month;
      if (len <= 4) {
        // dd.m or dd.mm → dd.mm.
        if (len === 4) masked += ".";
        return masked;
      }
      // dd.mm.yyyy (partial year allowed)
      masked = day + "." + month + "." + year;
      return masked;
    };

    const handleInput = (e) => {
      const target = e.target;
      const before = target.value;
      let masked = formatToMask(before);

      // Agar foydalanuvchi nuqtani (.) o'chirish uchun Backspace bosgan bo'lsa,
      // 2 yoki 4 raqam chegarasida qo'shiladigan avtomatik nuqtani qayta qo'shmaymiz
      if (backspaceOverDotRef.current) {
        const digits = (before || "").replace(/\D/g, "").slice(0, 8);
        if (digits.length === 2 || digits.length === 4) {
          masked = masked.replace(/\.$/, "");
        }
      }
      if (before !== masked) {
        const pos = masked.length;
        target.value = masked;
        // kursorni oxiriga surish
        try {
          target.setSelectionRange(pos, pos);
        } catch (_) {}
      }
    };

    const handleKeyDown = (e) => {
      const list = root.querySelectorAll("input");
      if (!(list && list.length >= 2)) return;
      const [startInput, endInput] = list;

      // Backspace bosilganda va kursor nuqta oldida bo'lsa, flag yoqiladi
      if (e.key === "Backspace" && document.activeElement instanceof HTMLInputElement) {
        const el = document.activeElement;
        const pos = el.selectionStart || 0;
        const val = el.value || "";
        backspaceOverDotRef.current = pos > 0 && val.charAt(pos - 1) === ".";
      } else {
        backspaceOverDotRef.current = false;
      }

      // Enter: start → end
      if (e.key === "Enter" && document.activeElement === startInput) {
        e.preventDefault();
        endInput?.focus();
        return;
      }
      // Tab: start → end (Shift+Tabni to'xtatmaymiz)
      if (e.key === "Tab" && !e.shiftKey && document.activeElement === startInput) {
        e.preventDefault();
        endInput?.focus();
      }
    };

    inputs.forEach((inputEl, index) => {
      inputEl.addEventListener("input", handleInput);
      inputEl.addEventListener("keydown", handleKeyDown);
      
      // Set proper tab indices for individual inputs
      if (tabIndex && typeof tabIndex === 'number') {
        inputEl.tabIndex = tabIndex + index;
      }
      
      // Auto focus on the first input if autoFocus is true
      if (autoFocus && index === 0) {
        setTimeout(() => {
          inputEl.focus();
        }, 100);
      }
    });

    return () => {
      inputs.forEach((inputEl) => {
        inputEl.removeEventListener("input", handleInput);
        inputEl.removeEventListener("keydown", handleKeyDown);
      });
    };
  }, [autoMask, picker, tabIndex, autoFocus]);

  const handleChange = useCallback(
    (dates) => {
      if (onChange) {
        onChange(dates);
      }

      if (!setState || !state || !startKey || !endKey) return;

      if (dates && dates[0] && dates[1]) {
        // Build UTC midnight timestamps to avoid timezone shifts across locales
        const start = dayjs
          .utc(dates[0].format("YYYY-MM-DD"), "YYYY-MM-DD")
          .startOf("day")
          .toISOString();
        const end = dayjs
          .utc(dates[1].format("YYYY-MM-DD"), "YYYY-MM-DD")
          .endOf("day")
          .toISOString();

        setState({
          ...state,
          [startKey]: start,
          [endKey]: end,
        });
        resetPage?.(1);
      } else {
        setState({
          ...state,
          [startKey]: null,
          [endKey]: null,
        });
        resetPage?.(1);
      }
    },
    [onChange, setState, state, startKey, endKey, resetPage]
  );

  const memoizedPlaceholder = useMemo(() => placeholder, [placeholder]);

  return (
    <span ref={wrapperRef} style={{ display: "inline-block", width: "100%" }}>
      <DatePicker.RangePicker
        picker={picker}
        onChange={handleChange}
        allowClear={allowClear}
        format={format}
        placeholder={memoizedPlaceholder}
        style={style}
        inputReadOnly={false}
        {...rest}
      />
    </span>
  );
};

export default DateRangeFilter;


