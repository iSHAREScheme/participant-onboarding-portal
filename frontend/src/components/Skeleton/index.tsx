import React from "react";
import styles from "./Skeleton.module.css";

interface SkeletonProps {
  /** Width (number = px, string = any CSS length). Defaults to 100%. */
  width?: string | number;
  /** Height (number = px, string = any CSS length). Defaults to 1em. */
  height?: string | number;
  /** Border radius (number = px). Defaults to the component's rounded corners. */
  radius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

const toCss = (v?: string | number) =>
  typeof v === "number" ? `${v}px` : v;

// A single shimmering placeholder. Compose several to mirror real content while
// it loads (see the participants list/detail skeletons).
const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  radius,
  className,
  style,
}) => (
  <span
    className={`${styles.skeleton}${className ? ` ${className}` : ""}`}
    style={{
      width: toCss(width),
      height: toCss(height),
      borderRadius: toCss(radius),
      ...style,
    }}
    aria-hidden="true"
  />
);

export default Skeleton;
