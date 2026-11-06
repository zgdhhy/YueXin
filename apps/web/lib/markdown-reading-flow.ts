type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> };
const content = (node: Node): string => node.value ?? node.children?.map(content).join("") ?? "";
const sentenceEnd = /[。！？][”’」』）)]*\s*$/u;

/** 只整理文章顶层的超长自然段；不重写文字，不拆公式、链接、代码或列表。 */
export function remarkReadingFlow() {
  return (tree: Node) => {
    // remark-math treats same-line $$…$$ as inline math. A standalone formula
    // should use display layout, including inside lists and blockquotes.
    function displayMath(node: Node) {
      const children = node.children?.filter(child => child.type !== "text" || child.value?.trim());
      if (node.type === "paragraph" && children?.length === 1 && children[0].type === "inlineMath") {
        const value = children[0].value ?? "";
        node.type = "math";
        node.value = value;
        delete node.children;
        node.data = { hName: "pre", hChildren: [{ type: "element", tagName: "code", properties: { className: ["language-math", "math-display"] }, children: [{ type: "text", value }] }] };
      } else node.children?.forEach(displayMath);
    }
    displayMath(tree);
    tree.children = tree.children?.flatMap(paragraph => {
      if (paragraph.type !== "paragraph" || !paragraph.children || content(paragraph).length < 280) return [paragraph];
      const pieces = paragraph.children.flatMap(child => child.type === "text" && child.value
        ? child.value.split(/(?<=[。！？][”’」』）)]{0,2})(?![”’」』）)])/u).filter(Boolean).map(value => ({ ...child, value }))
        : [child]);
      const groups: Node[][] = [];
      let group: Node[] = [];
      let length = 0;
      for (const piece of pieces) {
        group.push(piece);
        length += content(piece).length;
        if (length >= 140 && sentenceEnd.test(content(piece))) { groups.push(group); group = []; length = 0; }
      }
      if (group.length) {
        if (length < 50 && groups.length) groups[groups.length - 1].push(...group);
        else groups.push(group);
      }
      return groups.length > 1 ? groups.map(children => ({ ...paragraph, children })) : [paragraph];
    });
  };
}
