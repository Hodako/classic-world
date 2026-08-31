import { useCachedAsset } from "@/lib/asset-cache";

export function ProductImage({
  path,
  src,
  alt = "Product",
  className = "",
}: {
  path?: string | null;
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const imageSrc = path || src || null;
  const cachedPath = useCachedAsset(imageSrc);
  const fallbackIcon = useCachedAsset("https://img.icons8.com/clouds/100/product.png");

  if (!imageSrc) {
    return (
      <div className={`bg-secondary/40 grid place-items-center p-1.5 ${className}`}>
        <img
          src={fallbackIcon || "https://img.icons8.com/clouds/100/product.png"}
          className="w-2/3 h-2/3 max-w-[48px] object-contain"
          alt={alt}
        />
      </div>
    );
  }

  return (
    <img
      src={cachedPath || imageSrc}
      className={`object-cover ${className}`}
      alt={alt}
      loading="lazy"
    />
  );
}