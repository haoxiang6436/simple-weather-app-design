import { cloneVNode, Comment, defineComponent, Fragment, h, Text, TransitionGroup } from 'vue'
import { staggerStyle } from './stagger'

function elements(children) {
  return children.flatMap((child) => {
    if (child.type === Fragment) return elements(child.children || [])
    return child.type === Comment || child.type === Text ? [] : [child]
  })
}

// 直接复用原容器标签；直接子元素必须有稳定 key，动态插入也由 Vue 托管。
export default defineComponent({
  name: 'StaggerGroup',
  inheritAttrs: false,
  props: {
    tag: { type: String, default: 'div' },
    preset: { type: String, default: 'content' },
    startIndex: { type: Number, default: 0 },
    appear: { type: Boolean, default: true },
  },
  setup(props, { attrs, slots }) {
    return () => h(TransitionGroup, {
      ...attrs,
      tag: props.tag,
      name: 'stagger',
      type: 'transition',
      appear: props.appear,
    }, {
      default: () => elements(slots.default?.() || []).map((child, index) =>
        cloneVNode(child, { style: staggerStyle(props.preset, props.startIndex + index) })),
    })
  },
})
