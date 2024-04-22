<script setup>

</script>

<template>
  <div class="StarrySky">
    <div class="layer1"></div>
    <div class="layer2"></div>
    <div class="layer3"></div>
    <div class="layer4"></div>
    <div class="layer5"></div>
  </div>
</template>

<style lang="scss" scoped>
@function getShadows($n) {
  $shadows: '#{random(100)}vw #{random(100)}vh #fff';

  @for $i from 2 through $n {
    $shadows: '#{$shadows}, #{random(100)}vw #{random(100)}vh #fff';
  }

  @return unquote($shadows)
}

$duration: 1000s;

@for $i from 1 through 5 {
  $duration: $duration/2;
  .layer#{$i} {
    $size: #{$i}px;
    position: fixed;
    width: $size;
    height: $size;
    border-radius: 50%;
    left: 0;
    top: 0;
    box-shadow: getShadows(100);
    animation: move $duration linear infinite;

    &::after {
      content: '';
      position: fixed;
      left: 0;
      top: 100vh;
      border-radius: 50%;
      width: inherit;
      height: inherit;
      box-shadow: inherit;
    }
  }
}


@keyframes move {
  to {
    transform: translateY(-100vh);
  }

}
</style>
