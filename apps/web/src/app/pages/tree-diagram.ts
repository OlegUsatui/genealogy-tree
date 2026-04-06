import type { Person, Relationship, TreeResponse } from "@family-tree/shared";

import { hierarchy, tree as d3Tree } from "d3-hierarchy";
import { linkHorizontal, linkVertical } from "d3-shape";

const nodeWidth = 206;
const nodeHeight = 108;
const levelGap = 188;
const siblingGap = 108;
const spouseGap = 62;
const spouseStackGap = 22;
const diagramPadding = 128;

interface HierarchyNodeData {
  id: string;
  person: Person;
  children: HierarchyNodeData[];
}

interface ConnectorPoint {
  x: number;
  y: number;
}

interface ConnectorDatum {
  source: ConnectorPoint;
  target: ConnectorPoint;
}

interface InternalDiagramNode extends TreeDiagramNode {
  cx: number;
  cy: number;
}

export interface TreeDiagramNode {
  key: string;
  person: Person;
  x: number;
  y: number;
  width: number;
  height: number;
  role: "root" | "ancestor" | "descendant" | "spouse";
}

export interface TreeDiagramLink {
  key: string;
  kind: "branch" | "spouse";
  path: string;
}

export interface TreeDiagram {
  nodes: TreeDiagramNode[];
  links: TreeDiagramLink[];
  viewBox: string;
  width: number;
  height: number;
}

const verticalConnector = linkVertical<ConnectorDatum, ConnectorPoint>()
  .x((point) => point.x)
  .y((point) => point.y);

const horizontalConnector = linkHorizontal<ConnectorDatum, ConnectorPoint>()
  .x((point) => point.x)
  .y((point) => point.y);

export function buildTreeDiagram(tree: TreeResponse): TreeDiagram {
  const personMap = new Map(tree.persons.map((person) => [person.id, person] as const));
  const rootPerson = personMap.get(tree.rootPersonId);

  if (!rootPerson) {
    return {
      nodes: [],
      links: [],
      viewBox: "0 0 1200 720",
      width: 1200,
      height: 720,
    };
  }

  const parentChildRelationships = tree.relationships.filter(
    (relationship) => relationship.type === "parent_child",
  );
  const spouseRelationships = tree.relationships.filter((relationship) => relationship.type === "spouse");

  const childrenByParent = groupRelationshipIds(parentChildRelationships, "person1Id", "person2Id");
  const parentsByChild = groupRelationshipIds(parentChildRelationships, "person2Id", "person1Id");

  const primaryNodes = new Map<string, InternalDiagramNode>();
  const links: TreeDiagramLink[] = [];
  const layout = d3Tree<HierarchyNodeData>().nodeSize([nodeWidth + siblingGap, levelGap]);

  const descendantHierarchy = layout(
    hierarchy(
      buildHierarchyTree(rootPerson.id, childrenByParent, personMap, new Set<string>()),
    ).sort((left, right) => comparePersons(left.data.person, right.data.person)),
  );

  for (const node of descendantHierarchy.descendants()) {
    primaryNodes.set(
      node.data.id,
      createDiagramNode(node.x, node.y, node.data.person, node.depth === 0 ? "root" : "descendant"),
    );
  }

  for (const link of descendantHierarchy.links()) {
    const source = primaryNodes.get(link.source.data.id);
    const target = primaryNodes.get(link.target.data.id);

    if (source && target) {
      links.push(createBranchLink(`branch-desc-${link.source.data.id}-${link.target.data.id}`, source, target));
    }
  }

  const ancestorHierarchy = layout(
    hierarchy(
      buildHierarchyTree(rootPerson.id, parentsByChild, personMap, new Set<string>()),
    ).sort((left, right) => comparePersons(left.data.person, right.data.person)),
  );

  for (const node of ancestorHierarchy.descendants()) {
    if (node.depth === 0) {
      continue;
    }

    primaryNodes.set(node.data.id, createDiagramNode(node.x, -node.y, node.data.person, "ancestor"));
  }

  for (const link of ancestorHierarchy.links()) {
    const source = primaryNodes.get(link.source.data.id);
    const target = primaryNodes.get(link.target.data.id);

    if (source && target) {
      links.push(createBranchLink(`branch-anc-${link.source.data.id}-${link.target.data.id}`, source, target));
    }
  }

  const spouseNodes = buildSpouseNodes(spouseRelationships, personMap, primaryNodes, links);
  const allNodes = [...primaryNodes.values(), ...spouseNodes];

  if (allNodes.length === 0) {
    return {
      nodes: [],
      links,
      viewBox: "0 0 1200 720",
      width: 1200,
      height: 720,
    };
  }

  const minX = Math.min(...allNodes.map((node) => node.x)) - diagramPadding;
  const minY = Math.min(...allNodes.map((node) => node.y)) - diagramPadding;
  const maxX = Math.max(...allNodes.map((node) => node.x + node.width)) + diagramPadding;
  const maxY = Math.max(...allNodes.map((node) => node.y + node.height)) + diagramPadding;
  const width = maxX - minX;
  const height = maxY - minY;

  return {
    nodes: allNodes,
    links,
    viewBox: `${minX} ${minY} ${width} ${height}`,
    width,
    height,
  };
}

function buildHierarchyTree(
  rootId: string,
  adjacencyMap: Map<string, string[]>,
  personMap: Map<string, Person>,
  visited: Set<string>,
): HierarchyNodeData {
  const rootPerson = personMap.get(rootId);

  if (!rootPerson) {
    throw new Error(`Missing person for id ${rootId}`);
  }

  visited.add(rootId);
  const relatedIds = (adjacencyMap.get(rootId) ?? [])
    .filter((personId) => personMap.has(personId) && !visited.has(personId))
    .sort((left, right) => comparePersons(personMap.get(left)!, personMap.get(right)!));

  return {
    id: rootId,
    person: rootPerson,
    children: relatedIds.map((personId) => buildHierarchyTree(personId, adjacencyMap, personMap, visited)),
  };
}

function groupRelationshipIds(
  relationships: Relationship[],
  sourceKey: "person1Id" | "person2Id",
  targetKey: "person1Id" | "person2Id",
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const relationship of relationships) {
    const sourceId = relationship[sourceKey];
    const targetId = relationship[targetKey];
    const values = result.get(sourceId) ?? [];

    if (!values.includes(targetId)) {
      values.push(targetId);
      result.set(sourceId, values);
    }
  }

  return result;
}

function createDiagramNode(
  cx: number,
  cy: number,
  person: Person,
  role: TreeDiagramNode["role"],
): InternalDiagramNode {
  return {
    key: `${role}-${person.id}`,
    person,
    x: cx - nodeWidth / 2,
    y: cy - nodeHeight / 2,
    cx,
    cy,
    width: nodeWidth,
    height: nodeHeight,
    role,
  };
}

function buildSpouseNodes(
  relationships: Relationship[],
  personMap: Map<string, Person>,
  primaryNodes: Map<string, InternalDiagramNode>,
  links: TreeDiagramLink[],
): InternalDiagramNode[] {
  const spouseGroups = new Map<
    string,
    Array<{ relationship: Relationship; person: Person }>
  >();
  const spouseNodes: InternalDiagramNode[] = [];

  for (const relationship of relationships) {
    const firstPrimary = primaryNodes.get(relationship.person1Id);
    const secondPrimary = primaryNodes.get(relationship.person2Id);

    if (firstPrimary && secondPrimary) {
      links.push(createSpouseLink(`spouse-${relationship.id}`, firstPrimary, secondPrimary));
      continue;
    }

    const anchor = firstPrimary ?? secondPrimary;
    const spouseId = firstPrimary ? relationship.person2Id : relationship.person1Id;
    const spousePerson = personMap.get(spouseId);

    if (!anchor || !spousePerson) {
      continue;
    }

    const group = spouseGroups.get(anchor.person.id) ?? [];
    group.push({
      relationship,
      person: spousePerson,
    });
    spouseGroups.set(anchor.person.id, group);
  }

  for (const [anchorId, entries] of spouseGroups.entries()) {
    const anchor = primaryNodes.get(anchorId);

    if (!anchor) {
      continue;
    }

    entries
      .sort((left, right) => comparePersons(left.person, right.person))
      .forEach((entry, index) => {
        const offset = index - (entries.length - 1) / 2;
        const cy = anchor.cy + offset * (nodeHeight + spouseStackGap);
        const cx = anchor.cx + nodeWidth + spouseGap;
        const spouseNode = createDiagramNode(cx, cy, entry.person, "spouse");

        spouseNode.key = `spouse-${anchor.person.id}-${entry.person.id}`;
        spouseNodes.push(spouseNode);
        links.push(createSpouseLink(`spouse-${entry.relationship.id}`, anchor, spouseNode));
      });
  }

  return spouseNodes;
}

function createBranchLink(key: string, source: InternalDiagramNode, target: InternalDiagramNode): TreeDiagramLink {
  const path =
    verticalConnector({
      source: {
        x: source.cx,
        y: source.y + source.height,
      },
      target: {
        x: target.cx,
        y: target.y,
      },
    }) ?? "";

  return {
    key,
    kind: "branch",
    path,
  };
}

function createSpouseLink(key: string, leftCandidate: InternalDiagramNode, rightCandidate: InternalDiagramNode): TreeDiagramLink {
  const [left, right] =
    leftCandidate.cx <= rightCandidate.cx ? [leftCandidate, rightCandidate] : [rightCandidate, leftCandidate];
  const path =
    horizontalConnector({
      source: {
        x: left.x + left.width,
        y: left.cy,
      },
      target: {
        x: right.x,
        y: right.cy,
      },
    }) ?? "";

  return {
    key,
    kind: "spouse",
    path,
  };
}

function comparePersons(left: Person, right: Person): number {
  const leftName = [left.lastName ?? "", left.firstName, left.middleName ?? ""].join(" ").trim();
  const rightName = [right.lastName ?? "", right.firstName, right.middleName ?? ""].join(" ").trim();
  return leftName.localeCompare(rightName, "uk");
}
