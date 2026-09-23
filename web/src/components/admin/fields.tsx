import { hintCls, inputCls, labelCls } from "./ui";

/*
  Plain uncontrolled inputs: EntityForm reads them with FormData on submit.
  Required marks are browser-native; the API is the real validator.
*/

type Base = { label: string; name: string; required?: boolean; hint?: string };
type Value = string | number | null | undefined;

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
      <span className={labelCls}>
        {label}
        {required && " *"}
      </span>
      <input
        className={inputCls}
        name={name}
        type={type}
        dir={dir}
        required={required}
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
      <span className={labelCls}>
        {label}
        {required && " *"}
      </span>
      <textarea className={inputCls} name={name} dir={dir} rows={rows} required={required} defaultValue={defaultValue ?? ""} />
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

/**
 * The spec §4.2 pair: Arabic and English side by side, Arabic typed RTL.
 * Submits as `${name}_ar` and `${name}_en`.
 */
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

export type Option = string | { value: string; label: string };

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
      <span className={labelCls}>
        {label}
        {required && " *"}
      </span>
      <select className={inputCls} name={name} required={required} defaultValue={defaultValue ?? ""}>
        <option value="">—</option>
        {options.map((o) => {
          const { value, label: text } = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}

export function CheckboxField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-sea" />
      {label}
    </label>
  );
}
