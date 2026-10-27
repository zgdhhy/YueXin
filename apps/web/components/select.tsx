"use client";

import { Children, isValidElement, useEffect, useRef, useState } from "react";
import { Dropdown, type DropdownOption } from "./dropdown";

export function Select({ children, className, defaultValue, value: controlledValue, onChange, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const options: DropdownOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string; children?: React.ReactNode; disabled?: boolean }>(child)) return;
    options.push({ value: String(child.props.value ?? ""), label: child.props.children, text: Children.toArray(child.props.children).join(""), disabled: child.props.disabled });
  });
  const [value, setValue] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const native = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const form = native.current?.form;
    const reset = () => setValue(String(defaultValue ?? options[0]?.value ?? ""));
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, options[0]?.value]);
  return (
    <div className="relative">
      <select {...props} ref={native} id={undefined} tabIndex={-1} aria-hidden="true" className="sr-only" value={controlledValue ?? value} onChange={(e) => { setValue(e.target.value); onChange?.(e); }}>{children}</select>
      <Dropdown id={props.id} options={options} value={String(controlledValue ?? value)} disabled={props.disabled} className={className}
        onChange={(next) => {
          setValue(next);
          if (native.current) {
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(native.current, next);
            native.current.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }} />
    </div>
  );
}
