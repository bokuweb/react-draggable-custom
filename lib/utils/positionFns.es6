// @flow
import React from 'react';
import {isNum, int} from './shims';
import ReactDOM from 'react-dom';
import {innerWidth, innerHeight, outerWidth, outerHeight} from './domFns';

import type Draggable from '../Draggable';
export type ControlPosition = {
  clientX: number, clientY: number
};
export type Bounds = {
  left: number, top: number, right: number, bottom: number
};

export function getBoundPosition(draggable: Draggable, clientX: number, clientY: number): [number, number] {
  // If no bounds, short-circuit and move on
  if (!draggable.props.bounds) return [clientX, clientY];

  // Clone new bounds
  let {bounds} = draggable.props;
  bounds = typeof bounds === 'string' ? bounds : cloneBounds(bounds);
  let node = ReactDOM.findDOMNode(draggable);

  if (typeof bounds === 'string') {
    let boundNode;
    if (bounds === 'parent') {
      boundNode = node.parentNode;
    } else {
      boundNode = document.querySelector(bounds);
      if (!boundNode) throw new Error('Bounds selector "' + bounds + '" could not find an element.');
    }
    let nodeStyle = window.getComputedStyle(node);
    let boundNodeStyle = window.getComputedStyle(boundNode);
    // Compute bounds. This is a pain with padding and offsets but this gets it exactly right.
    bounds = {
      left: -node.offsetLeft + int(boundNodeStyle.paddingLeft) +
            int(nodeStyle.borderLeftWidth) + int(nodeStyle.marginLeft),
      top: -node.offsetTop + int(boundNodeStyle.paddingTop) +
            int(nodeStyle.borderTopWidth) + int(nodeStyle.marginTop),
      right: innerWidth(boundNode) - outerWidth(node) - node.offsetLeft,
      bottom: innerHeight(boundNode) - outerHeight(node) - node.offsetTop
    };
  }

  // Keep x and y below right and bottom limits...
  if (isNum(bounds.right)) clientX = Math.min(clientX, bounds.right);
  if (isNum(bounds.bottom)) clientY = Math.min(clientY, bounds.bottom);

  // But above left and top limits.
  if (isNum(bounds.left)) clientX = Math.max(clientX, bounds.left);
  if (isNum(bounds.top)) clientY = Math.max(clientY, bounds.top);

  return [clientX, clientY];
}

export function snapToGrid(grid: [number, number], pendingX: number, pendingY: number): [number, number] {
  let x = Math.round(pendingX / grid[0]) * grid[0];
  let y = Math.round(pendingY / grid[1]) * grid[1];
  return [x, y];
}

export function canDragX(draggable: React.Component): boolean {
  return draggable.props.axis === 'both' || draggable.props.axis === 'x';
}

export function canDragY(draggable: React.Component): boolean {
  return draggable.props.axis === 'both' || draggable.props.axis === 'y';
}

// Get {clientX, clientY} positions from event.
export function getControlPosition(e: Event): ControlPosition {
  let position = (e.targetTouches && e.targetTouches[0]) ||
    e.changedTouches && e.changedTouches[0] || e;

  return {
    clientX: position.clientX,
    clientY: position.clientY
  };
}

// A lot faster than stringify/parse
function cloneBounds(bounds: Bounds): Bounds {
  return {
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom
  };
}
