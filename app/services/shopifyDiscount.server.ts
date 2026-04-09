// app/services/shopifyDiscount.server.ts
// Creates a unique single-use Shopify discount code for review rewards.

export async function createReviewDiscountCode({
  shop,
  accessToken,
  discountValue,
  discountType,
  expiryDays,
}: {
  shop: string;
  accessToken: string;
  discountValue: number;
  discountType: "percentage" | "fixed";
  expiryDays: number;
}): Promise<string | null> {
  const code = `REVIEW-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + expiryDays);

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) { edges { node { code } } }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const customerGetsValue =
    discountType === "percentage"
      ? { percentage: discountValue / 100 }
      : { discountAmount: { amount: String(discountValue), appliesOnEachItem: false } };

  const variables = {
    basicCodeDiscount: {
      title: `Review reward ${code}`,
      code,
      startsAt: new Date().toISOString(),
      endsAt: endsAt.toISOString(),
      customerSelection: { all: true },
      customerGets: { value: customerGetsValue, items: { all: true } },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    },
  };

  try {
    const res = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const json = (await res.json()) as any;
    const errors = json?.data?.discountCodeBasicCreate?.userErrors ?? [];
    if (errors.length) {
      console.error("[discount] userErrors:", errors);
      return null;
    }

    const created =
      json?.data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount?.codes?.edges?.[0]?.node?.code;
    return created ?? code;
  } catch (e: any) {
    console.error("[discount] error:", e?.message);
    return null;
  }
}
