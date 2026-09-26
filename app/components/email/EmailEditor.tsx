// app/components/email/EmailEditor.tsx
// Block-based email editor: block list + settings on the left, live preview on
// the right. Replaces the Unlayer embed. Documents are plain JSON (EmailDoc),
// rendered with the same renderEmail() the server uses when sending.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionList,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  Collapsible,
  DropZone,
  Icon,
  InlineStack,
  Popover,
  RangeSlider,
  Select,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ButtonIcon,
  DeleteIcon,
  DesktopIcon,
  DiscountIcon,
  DuplicateIcon,
  ImageIcon,
  LayoutFooterIcon,
  LayoutHeaderIcon,
  MinusIcon,
  MobileIcon,
  PlusIcon,
  ProductIcon,
  TextIcon,
  TextTitleIcon,
} from "@shopify/polaris-icons";
import {
  BLOCK_LABELS,
  FONT_OPTIONS,
  createBlock,
  newBlockId,
  readableTextOn,
  renderEmail,
  withFooter,
  type Block,
  type BlockType,
  type EmailDoc,
  type EmailTheme,
  type ProductItem,
  type StoreBrand,
} from "~/email/blocks";

const BLOCK_ICONS: Record<BlockType, any> = {
  header: LayoutHeaderIcon,
  heading: TextTitleIcon,
  text: TextIcon,
  image: ImageIcon,
  button: ButtonIcon,
  products: ProductIcon,
  discount: DiscountIcon,
  divider: MinusIcon,
  spacer: MinusIcon,
  footer: LayoutFooterIcon,
};

const ADDABLE: BlockType[] = ["heading", "text", "image", "button", "products", "discount", "divider", "spacer", "header"];

type Props = {
  doc: EmailDoc;
  onChange: (doc: EmailDoc) => void;
  brand: StoreBrand | null;
  previewText?: string;
  disabled?: boolean;
  uploadImage: (file: File) => Promise<string | null>;
};

export function EmailEditor({ doc, onChange, brand, previewText, disabled, uploadImage }: Props) {
  const blocks = useMemo(() => withFooter(doc.blocks, brand ?? undefined), [doc.blocks, brand]);
  const [selectedId, setSelectedId] = useState<string | null>(blocks[0]?.id ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const setBlocks = (next: Block[]) => onChange({ ...doc, blocks: withFooter(next, brand ?? undefined) });
  const updateBlock = (id: string, patch: Partial<Block>) =>
    setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  const updateTheme = (patch: Partial<EmailTheme>) => onChange({ ...doc, theme: { ...doc.theme, ...patch } });

  const move = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    // The footer always stays last.
    if (i < 0 || j < 0 || j >= blocks.length - 1) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };
  const remove = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    setBlocks(blocks.filter((b) => b.id !== id));
    setSelectedId(blocks[Math.max(0, i - 1)]?.id ?? null);
  };
  const duplicate = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    const copy = { ...blocks[i], id: newBlockId() } as Block;
    setBlocks([...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)]);
    setSelectedId(copy.id);
  };
  const add = (type: BlockType) => {
    const block = createBlock(type, brand ?? undefined);
    const i = selected && selected.type !== "footer" ? blocks.indexOf(selected) + 1 : blocks.length - 1;
    setBlocks([...blocks.slice(0, i), block, ...blocks.slice(i)]);
    setSelectedId(block.id);
    setAddOpen(false);
  };

  return (
    <div className="ax-editor">
      <style>{`
        .ax-editor { display:grid; grid-template-columns:minmax(320px,400px) 1fr; gap:16px; align-items:start; }
        .ax-editor__preview { position:sticky; top:16px; }
        .ax-block-row { display:flex; align-items:center; gap:8px; width:100%; padding:8px 10px; border-radius:8px; border:1px solid transparent; background:none; cursor:pointer; text-align:left; font:inherit; color:inherit; }
        .ax-block-row:hover { background:var(--p-color-bg-surface-hover); }
        .ax-block-row[aria-current="true"] { background:var(--p-color-bg-surface-selected); border-color:var(--p-color-border-focus); }
        .ax-block-row__label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        @media (max-width: 1000px) { .ax-editor { grid-template-columns:1fr; } .ax-editor__preview { position:static; } }
      `}</style>

      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">Blocks</Text>
              <Popover
                active={addOpen}
                onClose={() => setAddOpen(false)}
                activator={
                  <Button icon={PlusIcon} onClick={() => setAddOpen((o) => !o)} disabled={disabled}>
                    Add block
                  </Button>
                }
              >
                <ActionList
                  items={ADDABLE.map((type) => ({
                    content: BLOCK_LABELS[type],
                    icon: BLOCK_ICONS[type],
                    onAction: () => add(type),
                  }))}
                />
              </Popover>
            </InlineStack>

            <BlockStack gap="100">
              {blocks.map((b, i) => (
                <InlineStack key={b.id} gap="100" blockAlign="center" wrap={false}>
                  <button
                    type="button"
                    className="ax-block-row"
                    aria-current={b.id === selectedId}
                    onClick={() => setSelectedId(b.id)}
                  >
                    <Icon source={BLOCK_ICONS[b.type]} tone="subdued" />
                    <span className="ax-block-row__label">
                      <Text as="span" variant="bodyMd">{blockSummary(b)}</Text>
                    </span>
                  </button>
                  {b.type !== "footer" && !disabled && (
                    <ButtonGroup variant="segmented">
                      <Button size="slim" icon={ArrowUpIcon} accessibilityLabel="Move up" disabled={i === 0} onClick={() => move(b.id, -1)} />
                      <Button size="slim" icon={ArrowDownIcon} accessibilityLabel="Move down" disabled={i >= blocks.length - 2} onClick={() => move(b.id, 1)} />
                    </ButtonGroup>
                  )}
                </InlineStack>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        {selected && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">{BLOCK_LABELS[selected.type]}</Text>
                {selected.type !== "footer" && !disabled && (
                  <ButtonGroup>
                    <Button icon={DuplicateIcon} accessibilityLabel="Duplicate block" onClick={() => duplicate(selected.id)} />
                    <Button icon={DeleteIcon} tone="critical" accessibilityLabel="Delete block" onClick={() => remove(selected.id)} />
                  </ButtonGroup>
                )}
              </InlineStack>
              <BlockSettings
                block={selected}
                brand={brand}
                disabled={disabled}
                onChange={(patch) => updateBlock(selected.id, patch)}
                uploadImage={uploadImage}
              />
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">Style</Text>
              <Button variant="plain" onClick={() => setStyleOpen((o) => !o)}>
                {styleOpen ? "Hide" : "Edit colours and font"}
              </Button>
            </InlineStack>
            <Collapsible id="ax-style" open={styleOpen}>
              <BlockStack gap="300">
                <ColorField
                  label="Brand colour"
                  helpText="Buttons, links and the discount box."
                  value={doc.theme.brandColor}
                  disabled={disabled}
                  onChange={(v) => updateTheme({ brandColor: v, brandTextColor: readableTextOn(v) })}
                />
                <ColorField label="Text colour" value={doc.theme.textColor} disabled={disabled} onChange={(v) => updateTheme({ textColor: v })} />
                <ColorField label="Email background" value={doc.theme.contentColor} disabled={disabled} onChange={(v) => updateTheme({ contentColor: v })} />
                <ColorField label="Page background" value={doc.theme.backgroundColor} disabled={disabled} onChange={(v) => updateTheme({ backgroundColor: v })} />
                <Select label="Font" options={FONT_OPTIONS} value={doc.theme.fontFamily} disabled={disabled} onChange={(v) => updateTheme({ fontFamily: v })} />
              </BlockStack>
            </Collapsible>
          </BlockStack>
        </Card>
      </BlockStack>

      <div className="ax-editor__preview">
        <Card padding="0">
          <Box padding="300" borderBlockEndWidth="025" borderColor="border">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">Preview</Text>
              <ButtonGroup variant="segmented">
                <Button icon={DesktopIcon} pressed={device === "desktop"} onClick={() => setDevice("desktop")} accessibilityLabel="Desktop preview" />
                <Button icon={MobileIcon} pressed={device === "mobile"} onClick={() => setDevice("mobile")} accessibilityLabel="Mobile preview" />
              </ButtonGroup>
            </InlineStack>
          </Box>
          <PreviewFrame doc={{ ...doc, blocks }} previewText={previewText} device={device} selectedId={selectedId} onSelect={setSelectedId} />
        </Card>
      </div>
    </div>
  );
}

// ─── Preview ────────────────────────────────────────────────────────────────

function PreviewFrame({
  doc,
  previewText,
  device,
  selectedId,
  onSelect,
}: {
  doc: EmailDoc;
  previewText?: string;
  device: "desktop" | "mobile";
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(700);

  const html = useMemo(() => {
    const raw = renderEmail(doc, { previewText, annotate: true })
      .replace(/\{\{first_name\}\}/gi, "Alex")
      .replace(/\{\{unsubscribe_url\}\}/gi, "#");
    // Links shouldn't navigate inside the editor; clicking picks the block instead.
    const editorCss = `<style>
      [data-ax-block] { cursor:pointer; }
      [data-ax-block]:hover { outline:1px dashed #8a8a8a; outline-offset:-1px; }
      [data-ax-block="${selectedId ?? ""}"] { outline:2px solid #005bd3 !important; outline-offset:-2px; }
    </style>`;
    return raw.replace("</head>", `${editorCss}</head>`);
  }, [doc, previewText, selectedId]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const onLoad = () => {
      const d = frame.contentDocument;
      if (!d) return;
      setHeight(Math.max(500, d.documentElement.scrollHeight));
      d.addEventListener("click", (e) => {
        e.preventDefault();
        const row = (e.target as HTMLElement)?.closest?.("[data-ax-block]");
        const id = row?.getAttribute("data-ax-block");
        if (id) onSelect(id);
      });
    };
    frame.addEventListener("load", onLoad);
    return () => frame.removeEventListener("load", onLoad);
  }, [onSelect]);

  return (
    <Box background="bg-surface-secondary" padding="400">
      <div style={{ display: "flex", justifyContent: "center" }}>
        <iframe
          ref={ref}
          title="Email preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          style={{ width: device === "mobile" ? 390 : "100%", maxWidth: 680, height, border: 0, display: "block", background: "transparent" }}
        />
      </div>
    </Box>
  );
}

// ─── Block settings ─────────────────────────────────────────────────────────

function BlockSettings({
  block,
  brand,
  disabled,
  onChange,
  uploadImage,
}: {
  block: Block;
  brand: StoreBrand | null;
  disabled?: boolean;
  onChange: (patch: Partial<Block>) => void;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  const alignOptions = [
    { label: "Centred", value: "center" },
    { label: "Left", value: "left" },
  ];
  const linkHelp = "Full address, e.g. https://yourstore.com/collections/new";

  switch (block.type) {
    case "header":
      return (
        <BlockStack gap="300">
          <ImageField label="Logo" value={block.logoUrl} disabled={disabled} uploadImage={uploadImage} onChange={(logoUrl) => onChange({ logoUrl })} />
          {brand?.logoUrl && block.logoUrl !== brand.logoUrl && (
            <Button variant="plain" onClick={() => onChange({ logoUrl: brand.logoUrl })}>Use logo from Shopify settings</Button>
          )}
          <TextField label="Store name" helpText="Shown when there's no logo." value={block.storeName} disabled={disabled} autoComplete="off" onChange={(storeName) => onChange({ storeName })} />
          {block.logoUrl && (
            <RangeSlider label="Logo width" value={block.logoWidth} min={60} max={300} step={10} output suffix={`${block.logoWidth}px`} disabled={disabled} onChange={(v) => onChange({ logoWidth: v as number })} />
          )}
          <Select
            label="Background"
            options={[{ label: "Same as email", value: "content" }, { label: "Brand colour", value: "brand" }]}
            value={block.background}
            disabled={disabled}
            onChange={(v) => onChange({ background: v as "brand" | "content" })}
          />
        </BlockStack>
      );
    case "heading":
      return (
        <BlockStack gap="300">
          <TextField label="Heading" value={block.text} disabled={disabled} autoComplete="off" multiline={2} onChange={(text) => onChange({ text })} helpText="Tip: {{first_name}} inserts the subscriber's first name." />
          <InlineStack gap="300" wrap={false}>
            <Box width="50%"><Select label="Size" options={[{ label: "Large", value: "large" }, { label: "Medium", value: "medium" }]} value={block.size} disabled={disabled} onChange={(v) => onChange({ size: v as any })} /></Box>
            <Box width="50%"><Select label="Alignment" options={alignOptions} value={block.align} disabled={disabled} onChange={(v) => onChange({ align: v as any })} /></Box>
          </InlineStack>
        </BlockStack>
      );
    case "text":
      return (
        <BlockStack gap="300">
          <TextField
            label="Text"
            value={block.text}
            disabled={disabled}
            autoComplete="off"
            multiline={6}
            onChange={(text) => onChange({ text })}
            helpText="**bold**, *italic*, [link text](https://…). Leave an empty line for a new paragraph."
          />
          <Select label="Alignment" options={alignOptions} value={block.align} disabled={disabled} onChange={(v) => onChange({ align: v as any })} />
        </BlockStack>
      );
    case "image":
      return (
        <BlockStack gap="300">
          <ImageField label="Image" value={block.src} disabled={disabled} uploadImage={uploadImage} onChange={(src) => onChange({ src })} />
          <TextField label="Description (alt text)" helpText="Read aloud by screen readers and shown when images are blocked." value={block.alt} disabled={disabled} autoComplete="off" onChange={(alt) => onChange({ alt })} />
          <TextField label="Link (optional)" value={block.href} disabled={disabled} autoComplete="off" placeholder={brand?.storeUrl} onChange={(href) => onChange({ href })} helpText={linkHelp} />
          <Checkbox label="Full width (edge to edge)" checked={block.fullWidth} disabled={disabled} onChange={(fullWidth) => onChange({ fullWidth })} />
        </BlockStack>
      );
    case "button":
      return (
        <BlockStack gap="300">
          <TextField label="Button text" value={block.label} disabled={disabled} autoComplete="off" onChange={(label) => onChange({ label })} />
          <TextField label="Link" value={block.href} disabled={disabled} autoComplete="off" placeholder={brand?.storeUrl} onChange={(href) => onChange({ href })} helpText={linkHelp} error={block.href ? undefined : "Add a link so the button goes somewhere."} />
          <Select label="Alignment" options={alignOptions} value={block.align} disabled={disabled} onChange={(v) => onChange({ align: v as any })} />
        </BlockStack>
      );
    case "products":
      return <ProductsSettings block={block} brand={brand} disabled={disabled} onChange={onChange} />;
    case "discount":
      return (
        <BlockStack gap="300">
          <TextField label="Discount code" helpText="Create the code first in Shopify → Discounts." value={block.code} disabled={disabled} autoComplete="off" onChange={(code) => onChange({ code: code.toUpperCase() })} />
          <TextField label="Text above the code" value={block.text} disabled={disabled} autoComplete="off" onChange={(text) => onChange({ text })} />
        </BlockStack>
      );
    case "divider":
      return <Text as="p" tone="subdued">A thin line to separate sections.</Text>;
    case "spacer":
      return <RangeSlider label="Height" value={block.height} min={8} max={96} step={4} output suffix={`${block.height}px`} disabled={disabled} onChange={(v) => onChange({ height: v as number })} />;
    case "footer":
      return (
        <BlockStack gap="300">
          <TextField label="Footer text" value={block.text} disabled={disabled} autoComplete="off" multiline={2} onChange={(text) => onChange({ text })} />
          <TextField
            label="Store address"
            helpText="Required by anti-spam laws (CAN-SPAM, UK PECR) in marketing emails."
            value={block.address}
            disabled={disabled}
            autoComplete="off"
            onChange={(address) => onChange({ address })}
            error={block.address.trim() ? undefined : "Add your store's postal address."}
          />
          {brand?.address && block.address !== brand.address && (
            <Button variant="plain" onClick={() => onChange({ address: brand.address })}>Use address from Shopify settings</Button>
          )}
          <Text as="p" variant="bodySm" tone="subdued">An unsubscribe link is always added and can't be removed.</Text>
        </BlockStack>
      );
  }
}

function ProductsSettings({
  block,
  brand,
  disabled,
  onChange,
}: {
  block: Extract<Block, { type: "products" }>;
  brand: StoreBrand | null;
  disabled?: boolean;
  onChange: (patch: Partial<Block>) => void;
}) {
  const pick = async () => {
    const shopify = (window as any).shopify;
    if (!shopify?.resourcePicker) return;
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: 6,
      selectionIds: block.items.map((p) => ({ id: p.id })),
    });
    if (!selection) return;
    const base = (brand?.storeUrl ?? "").replace(/\/$/, "");
    const items: ProductItem[] = selection.map((p: any) => {
      const variant = p.variants?.[0];
      return {
        id: p.id,
        title: p.title,
        price: formatPrice(variant?.price),
        imageUrl: p.images?.[0]?.originalSrc ?? p.images?.[0]?.url ?? "",
        url: p.handle ? `${base}/products/${p.handle}` : base,
      };
    });
    onChange({ items } as Partial<Block>);
  };

  return (
    <BlockStack gap="300">
      <Button onClick={pick} disabled={disabled} icon={ProductIcon}>
        {block.items.length ? "Change products" : "Choose products"}
      </Button>
      {block.items.map((p, i) => (
        <InlineStack key={p.id} gap="300" blockAlign="center" wrap={false}>
          <Thumbnail source={p.imageUrl || ImageIcon} alt={p.title} size="small" />
          <Box minWidth="0" width="100%">
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" truncate>{p.title}</Text>
              <TextField
                label="Price shown"
                labelHidden
                value={p.price}
                disabled={disabled}
                autoComplete="off"
                onChange={(price) => onChange({ items: block.items.map((x, j) => (j === i ? { ...x, price } : x)) } as Partial<Block>)}
              />
            </BlockStack>
          </Box>
          <Button
            icon={DeleteIcon}
            variant="plain"
            accessibilityLabel={`Remove ${p.title}`}
            disabled={disabled}
            onClick={() => onChange({ items: block.items.filter((_, j) => j !== i) } as Partial<Block>)}
          />
        </InlineStack>
      ))}
      <TextField label="Button text" value={block.buttonLabel} disabled={disabled} autoComplete="off" onChange={(buttonLabel) => onChange({ buttonLabel } as Partial<Block>)} />
      <Text as="p" variant="bodySm" tone="subdued">Prices are copied when you choose products. Update them here if they change before you send.</Text>
    </BlockStack>
  );
}

function formatPrice(price: unknown) {
  if (price == null || price === "") return "";
  const n = Number(price);
  return Number.isFinite(n) ? n.toFixed(2) : String(price);
}

// ─── Small fields ───────────────────────────────────────────────────────────

function ImageField({
  label,
  value,
  disabled,
  onChange,
  uploadImage,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (url: string) => void;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = async (_all: File[], accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const url = await uploadImage(file);
    setUploading(false);
    if (url) onChange(url);
    else setError("Upload failed. Use a JPG, PNG, GIF or WebP under 5 MB.");
  };

  return (
    <BlockStack gap="200">
      <DropZone label={label} accept="image/*" type="image" allowMultiple={false} disabled={disabled || uploading} onDrop={onDrop} error={!!error}>
        {value ? (
          <Box padding="200">
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <Thumbnail source={value} alt="" size="large" />
              <Text as="p" variant="bodySm" tone="subdued">{uploading ? "Uploading…" : "Drop a new image or click to replace"}</Text>
            </InlineStack>
          </Box>
        ) : (
          <DropZone.FileUpload actionTitle={uploading ? "Uploading…" : "Upload image"} actionHint="JPG, PNG, GIF or WebP, max 5 MB" />
        )}
      </DropZone>
      {error && <Text as="p" tone="critical" variant="bodySm">{error}</Text>}
      {value && !disabled && (
        <InlineStack>
          <Button variant="plain" tone="critical" onClick={() => onChange("")}>Remove image</Button>
        </InlineStack>
      )}
    </BlockStack>
  );
}

function ColorField({
  label,
  value,
  helpText,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  helpText?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <InlineStack gap="300" blockAlign="end" wrap={false}>
      <input
        type="color"
        aria-label={`${label} picker`}
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 36, height: 36, padding: 0, border: "1px solid var(--p-color-border)", borderRadius: 8, background: "none", cursor: "pointer", flex: "none", marginBottom: helpText ? 22 : 0 }}
      />
      <Box width="100%">
        <TextField label={label} value={value} helpText={helpText} disabled={disabled} autoComplete="off" onChange={onChange} />
      </Box>
    </InlineStack>
  );
}

function blockSummary(b: Block): string {
  const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);
  switch (b.type) {
    case "heading":
      return clip(b.text) || "Heading";
    case "text":
      return clip(b.text.replace(/[*[\]()]/g, "")) || "Text";
    case "button":
      return `Button: ${b.label}`;
    case "products":
      return b.items.length ? `${b.items.length} product${b.items.length === 1 ? "" : "s"}` : "Products (none chosen)";
    case "discount":
      return `Code: ${b.code}`;
    case "image":
      return b.src ? b.alt || "Image" : "Image (none yet)";
    default:
      return BLOCK_LABELS[b.type];
  }
}
