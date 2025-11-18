import { useState } from "react";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { Button, Card, FormLayout, Page, Text, TextField } from "@shopify/polaris";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <Page>
      <Card>
        <Form method="post">
          <FormLayout>
            <Text variant="headingMd" as="h2">
              Log in
            </Text>
            <TextField
              type="text"
              name="shop"
              label="Shop domain"
              helpText="example.myshopify.com"
              value={shop}
              onChange={setShop}
              autoComplete="on"
              error={errors?.shop}
            />
            <Button submit>Log in</Button>
          </FormLayout>
        </Form>
      </Card>
    </Page>
  );
}
