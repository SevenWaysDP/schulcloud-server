import { AnyBoardDo, BoardNodeBuilder, Card, Column, ColumnBoard, TextElement } from '../../domainobject';
import { EntityId } from '../../types';
import { BoardNode } from './boardnode.entity';
import { CardNode } from './card-node.entity';
import { ColumnBoardNode } from './column-board-node.entity';
import { ColumnNode } from './column-node.entity';
import { TextElementNode } from './text-element-node.entity';
import { BoardNodeType } from './types';

export class BoardNodeBuilderImpl implements BoardNodeBuilder {
	private parentsMap: Map<EntityId, BoardNode> = new Map();

	private resultNodes: BoardNode[] = [];

	constructor(parentNode?: BoardNode) {
		if (parentNode) {
			this.parentsMap.set(parentNode.id, parentNode);
		}
	}

	buildBoardNodes(domainObjects: AnyBoardDo[], parentId?: EntityId): BoardNode[] {
		this.buildChildren(domainObjects, parentId);
		return this.resultNodes;
	}

	buildColumnBoardNode(columnBoard: ColumnBoard): void {
		const columnBoardNode = new ColumnBoardNode({
			id: columnBoard.id,
			title: columnBoard.title,
		});
		this.registerNode(columnBoardNode);

		this.buildChildren(columnBoard.columns, columnBoardNode.id);
	}

	buildColumnNode(column: Column, parentId?: EntityId, position?: number): void {
		const parent = this.getParent(parentId);
		this.ensureBoardNodeType(parent, BoardNodeType.COLUMN_BOARD);

		const columnNode = new ColumnNode({
			id: column.id,
			title: column.title,
			parent,
			position,
		});
		this.registerNode(columnNode);

		this.buildChildren(column.cards, columnNode.id);
	}

	buildCardNode(card: Card, parentId?: EntityId, position?: number): void {
		const parent = this.getParent(parentId);
		this.ensureBoardNodeType(parent, BoardNodeType.COLUMN);

		const cardNode = new CardNode({
			id: card.id,
			height: card.height,
			title: card.title,
			parent,
			position,
		});
		this.registerNode(cardNode);

		this.buildChildren(card.elements, cardNode.id);
	}

	buildTextElementNode(textElement: TextElement, parentId?: EntityId, position?: number): void {
		const parent = this.getParent(parentId);
		this.ensureBoardNodeType(parent, BoardNodeType.CARD);

		const textElementNode = new TextElementNode({
			id: textElement.id,
			text: textElement.text,
			parent,
			position,
		});
		this.registerNode(textElementNode);
	}

	registerNode(boardNode: BoardNode) {
		this.parentsMap.set(boardNode.id, boardNode);
		this.resultNodes.push(boardNode);
	}

	getParent(parentId?: EntityId): BoardNode | undefined {
		const parent = parentId ? this.parentsMap.get(parentId) : undefined;
		return parent;
	}

	ensureBoardNodeType(boardNode: BoardNode | undefined, ...allowedBoardNodeTypes: BoardNodeType[]) {
		if (boardNode && !allowedBoardNodeTypes.includes(boardNode.type)) {
			throw new Error(`board node type is not allowed: >${boardNode.type}<`);
		}
	}

	buildChildren(children: AnyBoardDo[], parentId?: EntityId): void {
		children.forEach((domainObject, position) => domainObject.useBoardNodeBuilder(this, parentId, position));
	}
}
