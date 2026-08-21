import { useCachedAsset } from "@/lib/asset-cache";

export function ProductImage({ path, className = "" }: { path: string | null; className?: string }) {
  const cachedPath = useCachedAsset(path);
  const fallbackIcon = useCachedAsset("https://img.icons8.com/clouds/100/product.png");

  if (!path) {
    return (
      <div className={`bg-secondary/40 grid place-items-center p-1.5 ${className}`}>
        <img
          src={fallbackIcon || "https://img.icons8.com/clouds/100/product.png"}
          className="w-2/3 h-2/3 max-w-[48px] object-contain"
          alt="product"
        />
      </div>
    );
  }

  return <img src={cachedPath || path} className={`object-cover ${className}`} alt="" loading="lazy" />;
}