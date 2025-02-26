/*
 * Code snippets collected from:
 * https://github.com/eclipse-langium/langium/blob/main/packages/langium/src/utils/cst-utils.ts
 *
 * TypeFox boilerplate copied below
 */

/******************************************************************************
 * Copyright 2021 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { CompositeCstNode, CstNode, LeafCstNode } from "langium";
function isCompositeCstNode(node: unknown): node is CompositeCstNode {
  return (
    typeof node === "object" &&
    node !== null &&
    Array.isArray((node as CompositeCstNode).content)
  );
}

export function isLeafCstNode(node: unknown): node is LeafCstNode {
  return (
    typeof node === "object" &&
    node !== null &&
    typeof (node as LeafCstNode).tokenType === "object"
  );
}

function binarySearch(
  node: CompositeCstNode,
  offset: number,
  closest: boolean,
): CstNode | undefined {
  let left = 0;
  let right = node.content.length - 1;
  let closestNode: CstNode | undefined = undefined;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const middleNode = node.content[middle];

    if (middleNode.offset <= offset && middleNode.end > offset) {
      // Found an exact match
      return middleNode;
    }

    if (middleNode.end <= offset) {
      // Update the closest node (less than offset) and move to the right half
      closestNode = closest ? middleNode : undefined;
      left = middle + 1;
    } else {
      // Move to the left half
      right = middle - 1;
    }
  }

  return closestNode;
}

/**
 * Finds the leaf CST node at the specified 0-based string offset.
 * Note that the given offset will be within the range of the returned leaf node.
 *
 * If the offset does not point to a CST node (but just white space), this method will return `undefined`.
 *
 * @param node The CST node to search through.
 * @param offset The specified offset.
 * @returns The CST node at the specified offset.
 */
export function findLeafNodeAtOffset(
  node: CstNode,
  offset: number,
): LeafCstNode | undefined {
  if (isLeafCstNode(node)) {
    return node;
  } else if (isCompositeCstNode(node)) {
    const searchResult = binarySearch(node, offset, false);
    if (searchResult) {
      return findLeafNodeAtOffset(searchResult, offset);
    }
  }
  return undefined;
}
