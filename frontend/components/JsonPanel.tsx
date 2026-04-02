"use client";

export function JsonPanel({
  title,
  data,
}: {
  title: string;
  data: unknown;
}) {
  return (
    <div className="card" style={{ width: "100%" }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

