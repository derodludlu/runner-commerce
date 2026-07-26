import RunnerStorefront from "../../RunnerStorefront";

export default function RunnerListingPage({
  params,
}: {
  params: { runnerCode: string; orderCode: string };
}) {
  return (
    <RunnerStorefront
      runnerCode={params.runnerCode}
      orderCode={params.orderCode}
    />
  );
}
