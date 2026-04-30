import Image from "next/image";
import { redirect } from "next/navigation";
import { Link, Heading, Text } from "frosted-ui";
import nudgeLogo from "@/app/assets/Nuget_logo_nobackfournd.png";

export default function HomePage() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NUDGE_DEV_LANDING !== "1"
  ) {
    redirect("/experiences/dev");
  }

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
