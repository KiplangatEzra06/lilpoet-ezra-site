const poems = document.querySelectorAll('.poem');

poems.forEach((poem, index) => {
    poem.style.opacity = 0;
    setTimeout(() => {
        poem.style.transition = "opacity 1.5s";
        poem.style.opacity = 1;
    }, index * 500);
});