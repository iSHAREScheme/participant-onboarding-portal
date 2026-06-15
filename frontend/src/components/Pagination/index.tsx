import { useLanguage } from "../../context/LanguageContext";
import { useMediaQuery } from "hooks";
import styles from "./Pagination.module.css";

type PageItem = number | "ellipsis";

// Pages shown either side of the current one (0 on mobile to keep the pager compact).
const SIBLINGS = 1;

const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);

/**
 * Constant-slot page list: always the same number of slots (siblings*2 + 5 —
 * first, last, current, two siblings, two ellipsis anchors), so the control's
 * width never changes as you move between pages. First and last are always shown;
 * the rest is a window around the current page with "…" filling the gaps.
 */
export const getPaginationItems = (
  current: number,
  total: number,
  siblings: number = SIBLINGS
): PageItem[] => {
  const totalSlots = siblings * 2 + 5;
  if (total <= totalSlots) return range(1, total);

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);
  const showLeftDots = left > 2;
  const showRightDots = right < total - 1;
  const edgeCount = 3 + 2 * siblings;

  if (!showLeftDots && showRightDots) {
    return [...range(1, edgeCount), "ellipsis", total];
  }
  if (showLeftDots && !showRightDots) {
    return [1, "ellipsis", ...range(total - edgeCount + 1, total)];
  }
  return [1, "ellipsis", ...range(left, right), "ellipsis", total];
};

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Shared constant-width pager with previous/next arrows and a windowed page list.
 * Renders nothing when there is a single page. Used by the participants, proposals
 * and users tables so the pagination UI stays identical across the admin screens.
 */
const Pagination = ({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) => {
  const { t } = useLanguage();
  const isNarrow = useMediaQuery("(max-width: 640px)");

  if (totalPages <= 1) return null;

  const go = (next: number) => {
    const target = Math.min(Math.max(1, next), totalPages);
    if (target !== page) onPageChange(target);
  };

  return (
    <div
      className={className ? `${styles.pagination} ${className}` : styles.pagination}
    >
      <button
        className={styles.pageArrow}
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        aria-label={t("common.previous")}
        title={t("common.previous")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {getPaginationItems(page, totalPages, isNarrow ? 0 : SIBLINGS).map((item, i) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${i}`}
            className={styles.pageEllipsis}
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            className={
              item === page
                ? `${styles.pageNumber} ${styles.pageNumberActive}`
                : styles.pageNumber
            }
            onClick={() => go(item)}
            disabled={item === page}
            aria-current={item === page ? "page" : undefined}
          >
            {item}
          </button>
        )
      )}

      <button
        className={styles.pageArrow}
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        aria-label={t("common.next")}
        title={t("common.next")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
};

export default Pagination;
