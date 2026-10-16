interface Props {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; name: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode;
}

export function FormField({ name, label, error, hint, children }: Props) {
  const id = `f-${name}`;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children({ id, name, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-sm font-semibold text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Off-screen field that bots fill in and humans never see. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 h-px w-px overflow-hidden opacity-0 [clip-path:inset(50%)]">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
