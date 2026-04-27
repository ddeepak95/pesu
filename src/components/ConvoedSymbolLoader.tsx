import { cn } from "@/lib/utils";
import styles from "./ConvoedSymbolLoader.module.css";

export interface ConvoedSymbolLoaderProps {
  className?: string;
  /** Default true when used inside a parent that already exposes an accessible name (e.g. overlay `aria-label`). */
  "aria-hidden"?: boolean;
}

/**
 * Convoed mark: mask-based sheen over `public/convoed-symbol.svg`, inside a
 * spinning circular ring.
 */
export default function ConvoedSymbolLoader({
  className,
  "aria-hidden": ariaHidden = true,
}: ConvoedSymbolLoaderProps) {
  return (
    <span className={cn(styles.root, "text-primary", className)} aria-hidden={ariaHidden}>
      <span className={styles.ringWrap}>
        <span className={styles.ring} />
        <span className={styles.stack}>
          <span className={styles.mark} />
        </span>
      </span>
    </span>
  );
}
