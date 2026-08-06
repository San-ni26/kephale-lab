import React from 'react';

declare global {
  namespace JSX {
    type ElementType = any;
    type Element = React.ReactElement<any, any>;
    interface ElementClass {
      render(): React.ReactNode;
    }
    interface ElementAttributesProperty {
      props: {};
    }
    interface ElementChildrenAttribute {
      children: {};
    }
  }
}
