import { hintCls, inputCls, labelCls } from "./ui";

/*
  Uncontrolled inputs: EntityForm reads them with FormData on submit and
  watches input events for the unsaved-changes flag. Required marks are
  browser-native; the API is the real validator.
*/

type Base = { label: string; name: string; required?: boolean; hint?: string };
type Value = string | number | null | undefined;

function Label({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className={labelCls}>
      {label}
      {required && (
        <span aria-hidden="true" className="text-danger">
          {" *"}
        </span>
      )}
    </span>
  );
}

export function TextField({
  label,
  name,
  required,
  hint,
  defaultValue,
  type = "text",
  dir,
  ...rest
}: Base & {
  defaultValue?: Value;
  type?: string;
  dir?: "rtl" | "ltr";
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label label={label} required={required} />
      <input
        className={`${inputCls} ${type === "number" ? "num" : ""}`}
        name={name}
        type={type}
        dir={dir}
        required={required}
        aria-required={required}
        defaultValue={defaultValue ?? ""}
        {...rest}
      />
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  name,
  required,
  hint,
  defaultValue,
  dir,
  rows = 4,
}: Base & { defaultValue?: Value; dir?: "rtl" | "ltr"; rows?: number }) {
  return (
    <label className="block">
      <Label label={label} required={required} />
      <textarea
        className={inputCls}
        name={name}
        dir={dir}
        rows={rows}
        required={required}
        aria-required={required}
        defaultValue={defaultValue ?? ""}
      />
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

/** Spec §4.2: Arabic and English side by side, Arabic typed RTL and first. Submits `${name}_ar`/`${name}_en`. */
export function BilingualField({
  label,
  name,
  ar,
  en,
  required,
  multiline,
}: {
  label: string;
  name: string;
  ar?: string | null;
  en?: string | null;
  required?: boolean;
  multiline?: boolean;
}) {
  const Input = multiline ? TextArea : TextField;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label={`${label} · عربي`} name={`${name}_ar`} defaultValue={ar} required={required} dir="rtl" />
      <Input label={`${label} · English`} name={`${name}_en`} defaultValue={en} required={required} dir="ltr" />
    </div>
  );
}

export type Option = { value: string; label: string };

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  hint,
}: Base & { options: Option[]; defaultValue?: string | null }) {
  return (
    <label className="block">
      <Label label={label} required={required} />
      <select className={inputCls} name={name} required={required} aria-required={required} defaultValue={defaultValue ?? ""}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

export function CheckboxField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-[42px] items-center gap-2.5 text-[15px]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-sea" />
      {label}
    </label>
  );
}

/** Lays out the fields inside one form section. */
export function FieldGrid({ cols = 1, children }: { cols?: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={`grid gap-5 ${grid}`}>{children}</div>;
}
