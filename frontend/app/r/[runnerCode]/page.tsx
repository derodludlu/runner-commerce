import RunnerStorefront from "./RunnerStorefront";

export default function RunnerShopPage({
  params,
  searchParams,
}: {
  params: { runnerCode: string };
  searchParams?: { code?: string | string[] };
}) {
  const code = Array.isArray(searchParams?.code)
    ? searchParams?.code[0]
    : searchParams?.code;
  return <RunnerStorefront runnerCode={params.runnerCode} orderCode={code} />;
}
