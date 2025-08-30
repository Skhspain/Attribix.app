/// <reference types="react" />
import type React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
    interface Element extends React.JSX.Element {}
    interface ElementClass extends React.Component {}
    interface ElementAttributesProperty { props: any }
    interface ElementChildrenAttribute { children: any }
  }
}
export {};
