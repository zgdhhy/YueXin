import Image from "next/image";
import { SITE_ICON } from "@/lib/brand";

export function SiteMark({ size = 32 }: { size?: number }) {
  return <Image src={SITE_ICON} alt="" aria-hidden="true" width={size} height={size} className="site-mark shrink-0" unoptimized />;
}
