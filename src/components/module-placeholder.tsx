export function ModulePlaceholder({
  title,
  sprint,
  description,
}: {
  title: string;
  sprint: string;
  description?: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="cdaf-eyebrow text-muted-foreground">{sprint}</p>
        <h1 className="cdaf-headline">{title}</h1>
      </div>
      <p className="text-muted-foreground max-w-prose">
        {description ?? "Módulo en construcción. Se implementará en su sprint correspondiente."}
      </p>
    </div>
  );
}
