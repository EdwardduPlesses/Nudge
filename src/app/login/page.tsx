import Image from "next/image";
import { Heading, Text } from "frosted-ui";
import nudgeLogo from "@/app/assets/Nuget_logo_nobackfournd.png";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const startHref = `/api/auth/whop/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6 sm:py-20">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center">
          <Image
            src={nudgeLogo}
            alt=""
            width={96}
            height={96}
            className="h-full w-full max-h-24 object-contain object-center"
            priority
          />
        </div>
        <Heading size="7" className="mb-3">Sign in to Nudge</Heading>
        <Text size="3" color="gray" className="mb-8 leading-relaxed">
          Use your Whop account. You need an active Nudge membership in a Whop community.
        </Text>
        <a
          href={startHref}
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          Continue with Whop
        </a>
      </div>
    </div>
  );
}
