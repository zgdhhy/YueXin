type MarkdownNode = { type: string; value?: string; data?: unknown; children?: MarkdownNode[] };

/** 两个美元金额会被数学解析器配成一个公式；将明确的货币叙述还原为文字。 */
export function remarkLiteralCurrency() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.type === "inlineMath" && /^\d+(?:\.\d+)?(?:\/(?:任务|task|次|月|年|天|小时)|[，。；])/.test(node.value ?? "")) {
        node.type = "text";
        node.value = `$${node.value}$`;
        delete node.data;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
