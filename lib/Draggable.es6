// @flow
import {default as React, PropTypes} from 'react';
import ReactDOM from 'react-dom';
// $FlowIgnore
import classNames from 'classnames';
import {createUIEvent, createCSSTransform, createSVGTransform} from './utils/domFns';
import {canDragX, canDragY, getBoundPosition} from './utils/positionFns';
import {dontSetMe} from './utils/shims';
import DraggableCore from './DraggableCore';
import log from './utils/log';

import type {CoreEvent} from './utils/domFns';
export type CoreEventHandler = (e: Event, coreEvent: CoreEvent) => void | false;
export type DraggableState = {
  dragging: boolean,
  dragged: boolean,
  clientX: number, clientY: number,
  slackX: number, slackY: number,
  isElementSVG: boolean
};

//
// Define <Draggable>
//

export default class Draggable extends React.Component {

  static displayName = 'Draggable';

  static propTypes = {
    // Accepts all props <DraggableCore> accepts.
    ...DraggableCore.propTypes,

    /**
     * `axis` determines which axis the draggable can move.
     *
     *  Note that all callbacks will still return data as normal. This only
     *  controls flushing to the DOM.
     *
     * 'both' allows movement horizontally and vertically.
     * 'x' limits movement to horizontal axis.
     * 'y' limits movement to vertical axis.
     * 'none' limits all movement.
     *
     * Defaults to 'both'.
     */
    axis: PropTypes.oneOf(['both', 'x', 'y', 'none']),

    /**
     * `bounds` determines the range of movement available to the element.
     * Available values are:
     *
     * 'parent' restricts movement within the Draggable's parent node.
     *
     * Alternatively, pass an object with the following properties, all of which are optional:
     *
     * {left: LEFT_BOUND, right: RIGHT_BOUND, bottom: BOTTOM_BOUND, top: TOP_BOUND}
     *
     * All values are in px.
     *
     * Example:
     *
     * ```jsx
     *   let App = React.createClass({
     *       render: function () {
     *         return (
     *            <Draggable bounds={{right: 300, bottom: 300}}>
     *              <div>Content</div>
     *           </Draggable>
     *         );
     *       }
     *   });
     * ```
     */
    bounds: PropTypes.oneOfType([
      PropTypes.shape({
        left: PropTypes.Number,
        right: PropTypes.Number,
        top: PropTypes.Number,
        bottom: PropTypes.Number
      }),
      PropTypes.string,
      PropTypes.oneOf([false])
    ]),

    /**
     * `start` specifies the x and y that the dragged item should start at
     *
     * Example:
     *
     * ```jsx
     *      let App = React.createClass({
     *          render: function () {
     *              return (
     *                  <Draggable start={{x: 25, y: 25}}>
     *                      <div>I start with transformX: 25px and transformY: 25px;</div>
     *                  </Draggable>
     *              );
     *          }
     *      });
     * ```
     */
    start: PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number
    }),

    /**
     * `zIndex` specifies the zIndex to use while dragging.
     *
     * Example:
     *
     * ```jsx
     *   let App = React.createClass({
     *       render: function () {
     *           return (
     *               <Draggable zIndex={100}>
     *                   <div>I have a zIndex</div>
     *               </Draggable>
     *           );
     *       }
     *   });
     * ```
     */
    zIndex: PropTypes.number,

    /**
     * These properties should be defined on the child, not here.
     */
    className: dontSetMe,
    style: dontSetMe,
    transform: dontSetMe,

    parentScale: PropTypes.number
  };

  static defaultProps = {
    ...DraggableCore.defaultProps,
    axis: 'both',
    bounds: false,
    start: {x: 0, y: 0},
    zIndex: NaN,
    x: 0,
    y: 0,
    parentScale: 1
  };

  state: DraggableState = {
    // Whether or not we are currently dragging.
    dragging: false,

    // Whether or not we have been dragged before.
    dragged: false,

    // Current transform x and y.
    clientX: this.props.start.x, clientY: this.props.start.y,

    // Used for compensating for out-of-bounds drags
    slackX: 0, slackY: 0,

    // Can only determine if SVG after mounting
    isElementSVG: false
  };

  componentDidMount() {
    // Check to see if the element passed is an instanceof SVGElement
    if(ReactDOM.findDOMNode(this) instanceof SVGElement) {
      this.setState({ isElementSVG: true });
    }
  }

  componentWillUnmount() {
    this.setState({dragging: false}); // prevents invariant if unmounted while dragging
  }

  componentWillReceiveProps(next) {
    let { clientX, clientY } = this.state;
    if (next.x !== clientX　|| next.y !== clientY) {
      [clientX, clientY] = getBoundPosition(this, next.x, next.y);
      this.setState({ clientX, clientY });
    }
  }

  onDragStart: CoreEventHandler = (e, coreEvent) => {
    log('Draggable: onDragStart: %j', coreEvent.position);

    // Short-circuit if user's callback killed it.
    let shouldStart = this.props.onStart(e, createUIEvent(this, coreEvent));
    // Kills start event on core as well, so move handlers are never bound.
    if (shouldStart === false) return false;

    this.setState({dragging: true, dragged: true});
  };

  onDrag: CoreEventHandler = (e, coreEvent) => {
    if (!this.state.dragging) return false;
    log('Draggable: onDrag: %j', coreEvent.position);

    let uiEvent = createUIEvent(this, coreEvent);

    let newState = {
      clientX: uiEvent.position.left,
      clientY: uiEvent.position.top
    };

    // Keep within bounds.
    if (this.props.bounds) {
      // Save original x and y.
      let {clientX, clientY} = newState;

      // Add slack to the values used to calculate bound position. This will ensure that if
      // we start removing slack, the element won't react to it right away until it's been
      // completely removed.
      newState.clientX += this.state.slackX;
      newState.clientY += this.state.slackY;

      // Get bound position. This will ceil/floor the x and y within the boundaries.
      [newState.clientX, newState.clientY] = getBoundPosition(this, newState.clientX, newState.clientY);

      // Recalculate slack by noting how much was shaved by the boundPosition handler.
      newState.slackX = this.state.slackX + (clientX - newState.clientX);
      newState.slackY = this.state.slackY + (clientY - newState.clientY);

      // Update the event we fire to reflect what really happened after bounds took effect.
      uiEvent.position.left = clientX;
      uiEvent.position.top = clientY;
      uiEvent.deltaX = newState.clientX - this.state.clientX;
      uiEvent.deltaY = newState.clientY - this.state.clientY;
    }

    log('Draggable: onDrag uiEvent: %j', uiEvent);

    // Short-circuit if user's callback killed it.
    let shouldUpdate = this.props.onDrag(e, uiEvent);
    if (shouldUpdate === false) return false;

    this.setState(newState);
  };

  onDragStop: CoreEventHandler = (e, coreEvent) => {
    if (!this.state.dragging) return false;

    // Short-circuit if user's callback killed it.
    let shouldStop = this.props.onStop(e, createUIEvent(this, coreEvent));
    if (shouldStop === false) return false;

    log('Draggable: onDragStop: %j', coreEvent.position);

    this.setState({
      dragging: false,
      slackX: 0,
      slackY: 0
    });
  };

  render(): React.Element {
    let style = {}, svgTransform = null;

    // Add a CSS transform to move the element around. This allows us to move the element around
    // without worrying about whether or not it is relatively or absolutely positioned.
    // If the item you are dragging already has a transform set, wrap it in a <span> so <Draggable>
    // has a clean slate.
    const transformOpts = {
      // Set left if horizontal drag is enabled
      x: (canDragX(this) ?
         this.state.clientX :
         this.props.start.x),
 
      // Set top if vertical drag is enabled
      y: (canDragY(this) ?
         this.state.clientY :
         this.props.start.y)
    };

    // If this element was SVG, we use the `transform` attribute.
    if (this.state.isElementSVG) {
      svgTransform = createSVGTransform(transformOpts);
    } else {
      style = createCSSTransform(transformOpts);
    }

    // zIndex option
    if (this.state.dragging && !isNaN(this.props.zIndex)) {
      style.zIndex = this.props.zIndex;
    }

    // Mark with class while dragging
    let className = classNames((this.props.children.props.className || ''), 'react-draggable', {
      'react-draggable-dragging': this.state.dragging,
      'react-draggable-dragged': this.state.dragged
    });

    // Reuse the child provided
    // This makes it flexible to use whatever element is wanted (div, ul, etc)
    return (
      <DraggableCore {...this.props} onStart={this.onDragStart} onDrag={this.onDrag} onStop={this.onDragStop}>
        {React.cloneElement(React.Children.only(this.props.children), {
          className: className,
          style: {...this.props.children.props.style, ...style},
          transform: svgTransform
        })}
      </DraggableCore>
    );
  }
}

