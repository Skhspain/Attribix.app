// app/email/templates.ts
// Starter templates for the block editor. Built from the store's Shopify brand
// (logo, colours, name, address) so the first draft already looks like the shop.

import {
  EMAIL_DOC_FORMAT,
  createBlock,
  themeFromBrand,
  type Block,
  type EmailDoc,
  type StoreBrand,
} from "./blocks";

export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  subject: string;
  build: (brand: StoreBrand | null) => EmailDoc;
};

function doc(brand: StoreBrand | null, blocks: Block[]): EmailDoc {
  return {
    format: EMAIL_DOC_FORMAT,
    theme: themeFromBrand(brand),
    blocks: [createBlock("header", brand ?? undefined), ...blocks, createBlock("footer", brand ?? undefined)],
  };
}

function set<T extends Block>(block: Block, patch: Partial<T>): Block {
  return { ...block, ...patch } as Block;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Your logo and footer — start from scratch.",
    subject: "",
    build: (brand) => doc(brand, [createBlock("heading"), createBlock("text")]),
  },
  {
    id: "welcome",
    name: "Welcome",
    description: "Thank new subscribers and give them a reason to shop.",
    subject: "Welcome — here's a little something",
    build: (brand) => {
      const b = brand ?? undefined;
      return doc(brand, [
        createBlock("image", b),
        set(createBlock("heading", b), { text: "Welcome, {{first_name}}" }),
        set(createBlock("text", b), {
          text: `Thanks for joining ${brand?.storeName ?? "us"}. You'll be the first to hear about new arrivals, stories from the workshop and subscriber-only offers.\n\nAs a thank you, here's a code for your first order:`,
        }),
        createBlock("discount", b),
        set(createBlock("button", b), { label: "Start shopping" }),
      ]);
    },
  },
  {
    id: "new-arrivals",
    name: "New arrivals",
    description: "Show off new products with images and prices from your store.",
    subject: "Just landed: new pieces you'll love",
    build: (brand) => {
      const b = brand ?? undefined;
      return doc(brand, [
        set(createBlock("heading", b), { text: "New arrivals" }),
        set(createBlock("text", b), { text: "Fresh from the workshop — a first look at what's new this season." }),
        createBlock("products", b),
        set(createBlock("button", b), { label: "See the full collection" }),
      ]);
    },
  },
  {
    id: "sale",
    name: "Sale / offer",
    description: "Announce a promotion with a clear code and deadline.",
    subject: "For a few days only",
    build: (brand) => {
      const b = brand ?? undefined;
      return doc(brand, [
        createBlock("image", b),
        set(createBlock("heading", b), { text: "Our subscriber sale is on" }),
        set(createBlock("text", b), { text: "Enjoy **15% off** everything until Sunday at midnight. Just use the code below at checkout." }),
        set(createBlock("discount", b), { code: "SAVE15", text: "Your code" }),
        set(createBlock("button", b), { label: "Shop the sale" }),
      ]);
    },
  },
  {
    id: "story",
    name: "Story / news",
    description: "Share news, a guide or a behind-the-scenes story.",
    subject: "",
    build: (brand) => {
      const b = brand ?? undefined;
      return doc(brand, [
        createBlock("image", b),
        set(createBlock("heading", b), { text: "A story worth sharing", align: "left" }),
        set(createBlock("text", b), {
          text: "Start with a line that makes people want to read on.\n\nThen tell the story — what's new, why it matters, and what you'd like readers to do next.",
          align: "left",
        }),
        set(createBlock("button", b), { label: "Read more", align: "left" }),
      ]);
    },
  },
];

export function findTemplate(id: string) {
  return STARTER_TEMPLATES.find((t) => t.id === id) ?? STARTER_TEMPLATES[0];
}
