"use client";
import { memo, type CSSProperties } from "react";
import { BG3, BORDER } from "@/lib/constants";

type SkeletonVariant = "block" | "text" | "row";

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  radius?: number;
  count?: number;
  style?: CSSProperties;
}

const BASE_STYLE: CSSProperties = {
  display: "block",
  background: BG3,
  border: `1px solid ${BORDER}`,
  animation: "skeletonPulse 1.4s ease-in-out infinite",
};

const VARIANT_STYLE: Record<SkeletonVariant, CSSProperties> = {
  block: { height: 16, borderRadius: 4 },
  text: { height: 10, borderRadius: 3 },
  row: { height: 14, borderRadius: 3 },
};

function SkeletonBase({ variant = "block", width, height, radius, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        ...BASE_STYLE,
        ...VARIANT_STYLE[variant],
        width: width ?? "100%",
        ...(height !== undefined ? { height } : null),
        ...(radius !== undefined ? { borderRadius: radius } : null),
        ...style,
      }}
    />
  );
}

export const Skeleton = memo(function Skeleton(props: SkeletonProps) {
  const { count = 1 } = props;
  if (count <= 1) return <SkeletonBase {...props} />;
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBase key={index} {...props} count={1} />
      ))}
    </>
  );
});
