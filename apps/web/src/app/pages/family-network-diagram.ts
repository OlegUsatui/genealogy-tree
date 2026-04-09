import type { FamilyGraphResponse, Person, Relationship, TreeResponse } from "@family-tree/shared";

const nodeWidth = 214;
const nodeHeight = 186;
const horizontalGap = 286;
const levelGap = 236;
const diagramPadding = 144;

export type FamilyNetworkNodeRole = "focus" | "ancestor" | "descendant" | "same";

export type FamilyNetworkNode = {
  person: Person;
  role: FamilyNetworkNodeRole;
  level: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

export type FamilyNetworkLink = {
  relationship: Relationship;
  kind: "branch" | "spouse";
  path: string;
};

export type FamilyNetworkDiagram = {
  nodes: FamilyNetworkNode[];
  links: FamilyNetworkLink[];
  width: number;
  height: number;
  viewBox: string;
};

type FamilyNetworkSource = Pick<TreeResponse, "persons" | "relationships" | "rootPersonId"> | Pick<FamilyGraphResponse, "persons" | "relationships" | "focusPersonId">;

export function buildFamilyNetworkDiagram(source: FamilyNetworkSource): FamilyNetworkDiagram {
  const focusPersonId = "focusPersonId" in source ? source.focusPersonId : source.rootPersonId;

  if (source.persons.length === 0 || !focusPersonId) {
    return {
      nodes: [],
      links: [],
      width: 1200,
      height: 900,
      viewBox: "0 0 1200 900",
    };
  }

  const relationshipsByPerson = indexRelationships(source.relationships);
  const levels = assignLevels(focusPersonId, source.persons, relationshipsByPerson);
  const levelOrder = buildLevelOrder(source.persons, source.relationships, levels, relationshipsByPerson);
  const positionedNodes = createPositionedNodes(source.persons, focusPersonId, levels, levelOrder);
  const nodeMap = new Map(positionedNodes.map((node) => [node.person.id, node] as const));
  const links = source.relationships
    .map((relationship) => {
      const first = nodeMap.get(relationship.person1Id);
      const second = nodeMap.get(relationship.person2Id);

      if (!first || !second) {
        return null;
      }

      if (relationship.type === "spouse") {
        return {
          relationship,
          kind: "spouse" as const,
          path: createSpousePath(first, second),
        };
      }

      return {
        relationship,
        kind: "branch" as const,
        path: createBranchPath(first, second),
      };
    })
    .filter((link): link is FamilyNetworkLink => link !== null);

  const minX = Math.min(...positionedNodes.map((node) => node.x)) - diagramPadding;
  const minY = Math.min(...positionedNodes.map((node) => node.y)) - diagramPadding;
  const maxX = Math.max(...positionedNodes.map((node) => node.x + node.width)) + diagramPadding;
  const maxY = Math.max(...positionedNodes.map((node) => node.y + node.height)) + diagramPadding;
  const width = maxX - minX;
  const height = maxY - minY;

  return {
    nodes: positionedNodes,
    links,
    width,
    height,
    viewBox: `${minX} ${minY} ${width} ${height}`,
  };
}

function indexRelationships(relationships: Relationship[]): Map<string, Relationship[]> {
  const result = new Map<string, Relationship[]>();

  for (const relationship of relationships) {
    const first = result.get(relationship.person1Id) ?? [];
    first.push(relationship);
    result.set(relationship.person1Id, first);

    const second = result.get(relationship.person2Id) ?? [];
    second.push(relationship);
    result.set(relationship.person2Id, second);
  }

  return result;
}

function assignLevels(
  focusPersonId: string,
  persons: Person[],
  relationshipsByPerson: Map<string, Relationship[]>,
): Map<string, number> {
  const levels = new Map<string, number>([[focusPersonId, 0]]);
  const queue = [focusPersonId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (!currentId) {
      continue;
    }

    const currentLevel = levels.get(currentId) ?? 0;

    for (const relationship of relationshipsByPerson.get(currentId) ?? []) {
      const neighborId = relationship.person1Id === currentId ? relationship.person2Id : relationship.person1Id;
      const proposedLevel = relationship.type === "spouse"
        ? currentLevel
        : relationship.person1Id === currentId
          ? currentLevel + 1
          : currentLevel - 1;

      if (!levels.has(neighborId)) {
        levels.set(neighborId, proposedLevel);
        queue.push(neighborId);
      }
    }
  }

  for (const person of persons) {
    if (!levels.has(person.id)) {
      levels.set(person.id, 0);
    }
  }

  return levels;
}

function buildLevelOrder(
  persons: Person[],
  relationships: Relationship[],
  levels: Map<string, number>,
  relationshipsByPerson: Map<string, Relationship[]>,
): Map<number, string[]> {
  const personMap = new Map(persons.map((person) => [person.id, person] as const));
  const levelMap = new Map<number, string[]>();

  for (const person of persons) {
    const level = levels.get(person.id) ?? 0;
    const values = levelMap.get(level) ?? [];
    values.push(person.id);
    levelMap.set(level, values);
  }

  for (const [level, ids] of levelMap.entries()) {
    levelMap.set(
      level,
      ids.sort((left, right) => {
        const leftPerson = personMap.get(left);
        const rightPerson = personMap.get(right);

        if (!leftPerson || !rightPerson) {
          return 0;
        }

        return comparePersons(leftPerson, rightPerson);
      }),
    );
  }

  const sortedLevels = [...levelMap.keys()].sort((left, right) => left - right);

  for (let pass = 0; pass < 6; pass += 1) {
    for (const level of sortedLevels) {
      const ids = levelMap.get(level);

      if (!ids || ids.length < 2) {
        continue;
      }

      const currentIndex = buildIndexByLevel(levelMap);
      const nextIds = [...ids]
        .map((personId, originalIndex) => ({
          personId,
          originalIndex,
          barycenter: calculateBarycenter(personId, level, relationshipsByPerson, levels, currentIndex, originalIndex),
        }))
        .sort((left, right) => {
          if (Math.abs(left.barycenter - right.barycenter) > 0.0001) {
            return left.barycenter - right.barycenter;
          }

          return left.originalIndex - right.originalIndex;
        })
        .map((item) => item.personId);

      levelMap.set(level, compactSpousePairs(nextIds, relationships, levels, level));
    }

    for (const level of [...sortedLevels].reverse()) {
      const ids = levelMap.get(level);

      if (!ids || ids.length < 2) {
        continue;
      }

      const currentIndex = buildIndexByLevel(levelMap);
      const nextIds = [...ids]
        .map((personId, originalIndex) => ({
          personId,
          originalIndex,
          barycenter: calculateBarycenter(personId, level, relationshipsByPerson, levels, currentIndex, originalIndex),
        }))
        .sort((left, right) => {
          if (Math.abs(left.barycenter - right.barycenter) > 0.0001) {
            return left.barycenter - right.barycenter;
          }

          return left.originalIndex - right.originalIndex;
        })
        .map((item) => item.personId);

      levelMap.set(level, compactSpousePairs(nextIds, relationships, levels, level));
    }
  }

  return levelMap;
}

function buildIndexByLevel(levelMap: Map<number, string[]>): Map<number, Map<string, number>> {
  const result = new Map<number, Map<string, number>>();

  for (const [level, ids] of levelMap.entries()) {
    result.set(level, new Map(ids.map((id, index) => [id, index] as const)));
  }

  return result;
}

function calculateBarycenter(
  personId: string,
  level: number,
  relationshipsByPerson: Map<string, Relationship[]>,
  levels: Map<string, number>,
  currentIndex: Map<number, Map<string, number>>,
  fallback: number,
): number {
  const values: number[] = [];

  for (const relationship of relationshipsByPerson.get(personId) ?? []) {
    const otherId = relationship.person1Id === personId ? relationship.person2Id : relationship.person1Id;
    const otherLevel = levels.get(otherId);

    if (otherLevel === undefined) {
      continue;
    }

    if (relationship.type === "spouse" || Math.abs(otherLevel - level) === 1) {
      const order = currentIndex.get(otherLevel)?.get(otherId);

      if (order !== undefined) {
        values.push(order);
      }
    }
  }

  if (values.length === 0) {
    return fallback;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compactSpousePairs(
  ids: string[],
  relationships: Relationship[],
  levels: Map<string, number>,
  level: number,
): string[] {
  const nextIds = [...ids];
  const spousePairs = relationships.filter(
    (relationship) =>
      relationship.type === "spouse"
      && (levels.get(relationship.person1Id) ?? 0) === level
      && (levels.get(relationship.person2Id) ?? 0) === level,
  );

  for (const relationship of spousePairs) {
    const firstIndex = nextIds.indexOf(relationship.person1Id);
    const secondIndex = nextIds.indexOf(relationship.person2Id);

    if (firstIndex === -1 || secondIndex === -1 || Math.abs(firstIndex - secondIndex) <= 1) {
      continue;
    }

    const [anchorId, movingId] = firstIndex < secondIndex
      ? [relationship.person1Id, relationship.person2Id]
      : [relationship.person2Id, relationship.person1Id];
    const anchorIndex = nextIds.indexOf(anchorId);
    const movingIndex = nextIds.indexOf(movingId);

    if (anchorIndex === -1 || movingIndex === -1) {
      continue;
    }

    nextIds.splice(movingIndex, 1);
    nextIds.splice(anchorIndex + 1, 0, movingId);
  }

  return nextIds;
}

function createPositionedNodes(
  persons: Person[],
  focusPersonId: string,
  levels: Map<string, number>,
  levelOrder: Map<number, string[]>,
): FamilyNetworkNode[] {
  const personMap = new Map(persons.map((person) => [person.id, person] as const));
  const sortedLevels = [...levelOrder.keys()].sort((left, right) => left - right);
  const nodes: FamilyNetworkNode[] = [];

  for (const level of sortedLevels) {
    const ids = levelOrder.get(level) ?? [];
    const totalWidth = (ids.length - 1) * horizontalGap;
    const startCx = -totalWidth / 2;

    ids.forEach((personId, index) => {
      const person = personMap.get(personId);

      if (!person) {
        return;
      }

      const cx = startCx + index * horizontalGap;
      const cy = level * levelGap;
      const role: FamilyNetworkNodeRole = person.id === focusPersonId
        ? "focus"
        : level < 0
          ? "ancestor"
          : level > 0
            ? "descendant"
            : "same";

      nodes.push({
        person,
        role,
        level,
        x: cx - nodeWidth / 2,
        y: cy - nodeHeight / 2,
        cx,
        cy,
        width: nodeWidth,
        height: nodeHeight,
      });
    });
  }

  return nodes;
}

function createBranchPath(parent: FamilyNetworkNode, child: FamilyNetworkNode): string {
  const sourceX = parent.cx;
  const sourceY = parent.y + parent.height;
  const targetX = child.cx;
  const targetY = child.y;
  const controlY = sourceY + (targetY - sourceY) / 2;

  return `M ${sourceX} ${sourceY} C ${sourceX} ${controlY}, ${targetX} ${controlY}, ${targetX} ${targetY}`;
}

function createSpousePath(first: FamilyNetworkNode, second: FamilyNetworkNode): string {
  const [left, right] = first.cx <= second.cx ? [first, second] : [second, first];
  const sourceX = left.x + left.width;
  const sourceY = left.cy;
  const targetX = right.x;
  const targetY = right.cy;
  const controlX = sourceX + (targetX - sourceX) / 2;

  return `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${targetY}, ${targetX} ${targetY}`;
}

function comparePersons(left: Person, right: Person): number {
  const leftName = [left.lastName ?? "", left.firstName, left.middleName ?? ""].join(" ").trim();
  const rightName = [right.lastName ?? "", right.firstName, right.middleName ?? ""].join(" ").trim();
  return leftName.localeCompare(rightName, "uk");
}
