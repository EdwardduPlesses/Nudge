import { Link, Heading, Text } from "frosted-ui";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-20">
      <div className="max-w-lg text-center">
        <Heading size="8" className="mb-3">
          Nudge
        </Heading>
        <Text size="4" color="gray" className="mb-8">
          This budget companion runs inside a Whop experience. Install the app, then open it from a
          community sidebar to track spending and goals—no bank connection required.
        </Text>
        <Text size="2" color="gray">
          Hosting path in the Whop dashboard should be{" "}
          <code className="rounded bg-gray-500/15 px-1.5 py-0.5 text-sm">
            /experiences/[experienceId]
          </code>
          .
        </Text>
        <Link href="https://docs.whop.com/developer/guides/app-views" className="mt-6 inline-block">
          App views documentation
        </Link>
      </div>
    </div>
  );
}
