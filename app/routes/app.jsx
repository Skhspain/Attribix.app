// File: app/routes/app.jsx
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import translations from "@shopify/polaris/locales/en.json";
import { authenticate } from "~/shopify.server";
import { Outlet, useLoaderData, useRouteError, useLocation } from "@remix-run/react";
import {
  Frame,
  Navigation,
  AppProvider as PolarisProvider,
} from "@shopify/polaris";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function AppLayout() {
  const { apiKey } = useLoaderData();
  const location = useLocation();

  // Sidebar navigation
  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        title="Attribix.app"
        items={[
          { label: "Home", url: `/app${location.search}` },
          { label: "Additional", url: `/app/additional${location.search}` },
          { label: "Tracked Items", url: `/app/tracked-items${location.search}` },
          { label: "Stats", url: `/app/stats${location.search}` },
          { label: "Settings", url: `/app/settings${location.search}` },
        ]}
      />
    </Navigation>
  );

  return (
    <AppProvider
      isEmbeddedApp
      apiKey={apiKey}
      i18n={translations}
      ssrMatchMedia={() => true}
    >
      <PolarisProvider i18n={translations}>
        <Frame navigation={navigationMarkup}>
          <Outlet />
        </Frame>
      </PolarisProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return boundary.error(error);
}

export const headers = boundary.headers;