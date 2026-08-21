import { StorefrontClient } from "@/components/storefront-client";
import { fsGetProducts } from "@/lib/firestore-service";

interface PageProps {
  params: Promise<{
    "shop-name": string;
  }>;
}

export default async function StorefrontPage(props: PageProps) {
  const params = await props.params;
  const shopName = params["shop-name"] || "Classic World";

  try {
    const productsData = await fsGetProducts();

    const formattedProducts = (productsData || []).map((p: any) => ({
      id: String(p.id || p._id || ""),
      name: String(p.name || ""),
      sell_price: Number(p.sell_price) || 0,
      stock: Number(p.stock) || 0,
      category: String(p.category || ""),
      description: String(p.description || ""),
      image_url: p.image_url || null,
    }));

    const businessData = {
      name: "Classic World",
      logo_url: "/classic-world.svg",
    };

    return (
      <StorefrontClient
        business={businessData}
        initialProducts={formattedProducts}
      />
    );
  } catch (error) {
    return (
      <StorefrontClient
        business={{ name: "Classic World", logo_url: "/classic-world.svg" }}
        initialProducts={[]}
      />
    );
  }
}

export async function generateStaticParams() {
  return [{ "shop-name": "classic-world" }, { "shop-name": "fallback" }];
}
