const SIZES = {
  sm: "size-8 rounded-lg",
  md: "size-9 rounded-xl",
  lg: "size-14 rounded-2xl",
} as const;

interface Props {
  size?: keyof typeof SIZES;
  className?: string;
}

/** DeskAll brand mark from /public/logo.jpg with rounded corners. */
export function AppLogo({ size = "md", className = "" }: Props) {
  return (
    <img
      src="/logo.jpg"
      alt="DeskAll"
      draggable={false}
      className={[
        "shrink-0 object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]",
        SIZES[size],
        className,
      ].join(" ")}
    />
  );
}
