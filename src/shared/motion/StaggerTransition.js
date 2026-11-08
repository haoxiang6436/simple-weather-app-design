import { cloneVNode, Comment, defineComponent, h, Transition } from 'vue'
import { staggerStyle } from './stagger'

// 不创建 DOM 包装层，保留 Vue 原生的 v-if / v-show、取消与完成事件。
export default defineComponent({
  name: 'StaggerTransition',
  inheritAttrs: false,
  props: {
    preset: { type: String, default: 'content' },
    index: { type: Number, default: 0 },
    appear: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
  },
  setup(props, { attrs, slots }) {
    return () => h(Transition, {
      ...attrs,
      name: 'stagger',
      type: 'transition',
      appear: props.appear,
      css: props.enabled,
    }, {
      default: () => (slots.default?.() || []).map((child) => child.type === Comment
        ? child
        : cloneVNode(child, { style: staggerStyle(props.preset, props.index) })),
    })
  },
})
