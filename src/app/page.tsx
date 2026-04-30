import { Link, Heading, Text } from "frosted-ui";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6 sm:py-20">
      <div className="max-w-md text-center">
        <Heading size="8" className="mb-3 text-gold-primary">
          Nudge
        </Heading>
        <Text size="4" color="gray" className="mb-6 leading-relaxed">
          A simple budget view for Whop communities—track spending and goals without connecting a bank.
        </Text>
        <Link href="https://docs.whop.com/developer/guides/app-views" className="inline-block text-sm">
          About app views
        </Link>
      </div>
    </div>
  );
}
