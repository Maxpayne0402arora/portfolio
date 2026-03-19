document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById('main-nav');

    // Sticky Nav on scroll
    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 50);
    });

    // Reveal animations on scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    const revealElements = document.querySelectorAll('section, .project-card, .skill-card, .timeline-item, .card, .edu-card');
    revealElements.forEach(el => {
        if (el.id === 'hero' || el.closest('#hero')) {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            return;
        }
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        observer.observe(el);
    });

    const checkVisibility = () => {
        revealElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight * 0.9) {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }
        });
    };
    window.addEventListener('scroll', checkVisibility);
    checkVisibility();

    // =====================
    // Prototype Slider Logic
    // =====================
    const tabs = document.querySelectorAll('.proto-tab');
    const slides = document.querySelectorAll('.proto-slide');
    const dots = document.querySelectorAll('.proto-dot');
    const slider = document.getElementById('proto-slider');
    let currentIndex = 0;

    function goToSlide(index) {
        // Deactivate current
        tabs[currentIndex].classList.remove('active');
        slides[currentIndex].classList.remove('active');
        dots[currentIndex].classList.remove('active');

        // Activate next
        currentIndex = index;
        tabs[currentIndex].classList.add('active');
        slides[currentIndex].classList.add('active');
        dots[currentIndex].classList.add('active');

        // Move slider track
        slider.style.transform = `translateX(-${currentIndex * 100}%)`;
    }

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => goToSlide(i));
    });

    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => goToSlide(i));
    });

    // Auto-play every 4s
    let autoPlay = setInterval(() => {
        goToSlide((currentIndex + 1) % slides.length);
    }, 4000);

    // Pause on hover
    const sliderWrapper = document.querySelector('.proto-slider-wrapper');
    sliderWrapper.addEventListener('mouseenter', () => clearInterval(autoPlay));
    sliderWrapper.addEventListener('mouseleave', () => {
        autoPlay = setInterval(() => {
            goToSlide((currentIndex + 1) % slides.length);
        }, 4000);
    });

    // Touch / swipe support
    let touchStartX = 0;
    sliderWrapper.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    sliderWrapper.addEventListener('touchend', e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            goToSlide(diff > 0
                ? (currentIndex + 1) % slides.length
                : (currentIndex - 1 + slides.length) % slides.length);
        }
    });

    // Email copy on click
    const emailCard = document.getElementById('email-card');
    if (emailCard) {
        emailCard.addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText('Mayank_Arora2021@pgp.isb.edu').then(() => {
                const tooltip = emailCard.querySelector('.copy-tooltip');
                if (tooltip) {
                    tooltip.classList.add('show');
                    setTimeout(() => tooltip.classList.remove('show'), 2000);
                }
            });
        });
    }

    // Experience Section Collapsible (Mobile Only)
    const timelineItems = document.querySelectorAll('.timeline-item');
    timelineItems.forEach(item => {
        const content = item.querySelector('.timeline-content');
        if (content) {
            content.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    item.classList.toggle('expanded');
                }
            });
        }
    });


    // Modal support (kept for backward compat)
    const modal = document.getElementById('project-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.onclick = () => {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        };
    }
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    };
});
