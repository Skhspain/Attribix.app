import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { Page, Layout, Card } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const meta = () => [{ title: "Analytics" }];

export default function Analytics() {
  const data = [
    { name: "Jan", uv: 400 },
    { name: "Feb", uv: 800 },
    { name: "Mar", uv: 650 },
    { name: "Apr", uv: 500 },
    { name: "May", uv: 750 },
    { name: "Jun", uv: 900 }
  ];

  return (
    <Page>
      <TitleBar title="Analytics" />
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="uv" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}