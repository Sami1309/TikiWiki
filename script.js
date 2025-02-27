document.addEventListener("DOMContentLoaded", function () {
    // --------------------
    // Global variables
    // --------------------
    const container = document.getElementById("article-container");
    let articleQueue = [];
    const PRELOAD_COUNT = 20; // Increased from 10 to 20 for smoother scrolling
  
    // For category feed overlay:
    let currentCategoryOverlay = null;
    let categoryMembers = []; // for the currently open category
    const CATEGORY_PRELOAD_COUNT = 10; // number of articles to preload in category overlay
    let currentCategoryName = ""; // current category (a string)
  
    // Cache for preloaded category members keyed by category name.
    let preloadedCategories = {};
  
    // Initialize liked articles in localStorage
    if (!localStorage.getItem("likedArticles")) {
      localStorage.setItem("likedArticles", JSON.stringify([]));
    }
  
    // Global viewing mode for article images:
    let globalShrunk = false;
  
    // Add this to global variables section
    let categoryPreloadQueue = [];
    const CATEGORY_AHEAD_PRELOAD = 5; // Number of upcoming articles to preload categories for
  
    // Add this to global variables section
    let currentMainArticle = null; // Track the current article in main view
  
    // Add this to global variables section at the top of your file
    let isCategoryScrolling = false;
    let categoryScrollTimeout = null;
  
    // Add this to global variables section
    let articleCategoryCache = {}; // Cache to store article title -> category mapping
  
    // New global flag to prevent immediate re-opening
    let recentlyClosedCategory = false;
  
    // Add event listener for app title to refresh the page
    const appTitle = document.getElementById("app-title");
    if (appTitle) {
      appTitle.addEventListener("click", function() {
        window.location.reload();
      });
    }
  
    // Add this to global variables section
    let userSelectStyles = document.createElement('style');
    document.head.appendChild(userSelectStyles);
    userSelectStyles.sheet.insertRule(`
      #view-liked-btn, .category-header, #app-title {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
    `, 0);
  
    // Add this to global variables section
    let isMobileDevice = window.innerWidth <= 768;
    let navArrows = {
      right: null,
      left: null
    };
  
    // Create navigation arrows for desktop - CALL IT HERE
    createNavigationArrows();
  
    // Helper function to update all article cards to the current mode:
    function updateAllCardsViewMode() {
      document.querySelectorAll(".article-card").forEach((card) => {
        if (globalShrunk) {
          card.classList.add("shrunk");
        } else {
          card.classList.remove("shrunk");
        }
      });
    }
  
    // --------------------
    // MAIN FEED FUNCTIONS
    // --------------------
  
    async function fetchRandomArticle() {
      try {
        const response = await fetch(
          "https://en.wikipedia.org/api/rest_v1/page/random/summary"
        );
        if (!response.ok) throw new Error("Network error");
        const article = await response.json();
        return article;
      } catch (error) {
        console.error("Failed to fetch article:", error);
        return null;
      }
    }
  
    async function preloadArticles(count) {
      // Start a counter for loaded articles
      let loadedCount = 0;
      
      // Show first article immediately if we already have one in the queue
      if (articleQueue.length > 0 && container.childElementCount === 0) {
        addNextArticle();
        loadedCount++;
      }
      
      const preloadPromises = [];
      
      for (let i = 0; i < count; i++) {
        const preloadPromise = (async () => {
          try {
            const article = await fetchRandomArticle();
            if (article) {
              articleQueue.push(article);
              
              // Preload the category for this article immediately
              preloadCategoryForArticle(article);
              
              // Add this article to the category preload queue
              categoryPreloadQueue.push(article);
              
              // If we have enough articles in the queue, preload their categories
              if (categoryPreloadQueue.length >= CATEGORY_AHEAD_PRELOAD) {
                preloadCategoriesForQueuedArticles();
              }
              
              loadedCount++;
              
              // Show the first article as soon as it's loaded if none are showing yet
              if (loadedCount === 1 && container.childElementCount === 0) {
                addNextArticle();
              }
              
              // If container is still not filled with content, add more articles
              if (container.scrollHeight <= container.clientHeight && articleQueue.length > 0) {
                addNextArticle();
              }
            }
          } catch (error) {
            console.error("Error preloading article:", error);
          }
        })();
        
        preloadPromises.push(preloadPromise);
      }
      
      // Wait for at least one article to load before removing the loader
      if (preloadPromises.length > 0) {
        Promise.all(preloadPromises).then(() => {
          // If we've loaded at least one article, remove the initial loader
          if (loadedCount > 0) {
            removeInitialLoader();
          }
          
          // Fill the container if needed
          fillContainerWithArticles();
        });
      }
    }
  
    // New function to fill the container with articles if it's not full
    function fillContainerWithArticles() {
      // Keep adding articles until the container is filled or we run out of articles
      while (container.scrollHeight <= container.clientHeight && articleQueue.length > 0) {
        addNextArticle();
      }
    }
  
    // New helper function to ensure the main feed always has at least PRELOAD_COUNT articles preloaded.
    function ensureArticlesInQueue() {
      const targetCount = PRELOAD_COUNT;
      if (articleQueue.length < targetCount) {
        // Preload more articles
        preloadArticles(targetCount - articleQueue.length);
        
        // Preload images for ALL articles in the queue with high priority
        articleQueue.forEach(article => {
          if (article.originalimage && article.originalimage.source) {
            const preloadImg = new Image();
            preloadImg.fetchPriority = "high";
            preloadImg.src = article.originalimage.source;
          }
        });
        
        // Also check for any visible cards that need image loading
        preloadVisibleAndUpcomingImages();
      }
    }
  
    function createArticleCard(article) {
      const card = document.createElement("div");
      card.className = "article-card";
  
      if (article.originalimage && article.originalimage.source) {
        card.style.backgroundColor = "#000";
        const spinner = document.createElement("div");
        spinner.className = "spinner";
        card.appendChild(spinner);
        
        // Store the image URL on the card for later retrieval if needed
        card.dataset.imageUrl = article.originalimage.source;
        
        // Create image and set up loading
        const img = new Image();
        let isLoaded = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        function loadImage() {
          // Set up error handling before setting src
          img.onerror = function () {
            if (retryCount < maxRetries) {
              // Try loading again after a short delay
              retryCount++;
              setTimeout(loadImage, 1000);
            } else {
              // After max retries, show fallback
              spinner.remove();
              card.style.backgroundColor = "#333"; // Fallback color on error
            }
          };
          
          // Set up load handler
          img.onload = function () {
            isLoaded = true;
            card.style.backgroundImage = `url(${article.originalimage.source})`;
            spinner.remove();
          };
          
          // Set the image src
          img.src = article.originalimage.source;
        }
        
        // Start loading the image
        loadImage();
        
        // Add a timeout to handle stalled image loads
        const imageTimeout = setTimeout(() => {
          if (!isLoaded) {
            if (retryCount < maxRetries) {
              // Try again
              retryCount++;
              loadImage();
            } else {
              // After max retries, show fallback
              spinner.remove();
              card.style.backgroundColor = "#333"; // Fallback color on timeout
            }
          }
        }, 5000); // 5 second timeout
        
        // Create a more aggressive intersection observer to watch when cards come into view
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              // Card is visible or about to be visible, prioritize this image
              if (!isLoaded) {
                // Force a high-priority load
                const highPriorityImg = new Image();
                highPriorityImg.fetchPriority = "high"; // Set high fetch priority
                highPriorityImg.onload = function() {
                  card.style.backgroundImage = `url(${article.originalimage.source})`;
                  spinner.remove();
                  isLoaded = true;
                };
                highPriorityImg.onerror = img.onerror;
                highPriorityImg.src = article.originalimage.source;
              }
              observer.disconnect();
            }
          });
        }, {
          rootMargin: "500px 0px" // Increased to 500px to load earlier when scrolling fast
        });
        
        observer.observe(card);
      } else {
        card.style.backgroundColor = "#333";
      }
  
      const overlay = document.createElement("div");
      overlay.className = "article-overlay";

      const titleContainer = document.createElement('div');
      titleContainer.className = 'title-container';
  
      const title = document.createElement("h2");
      title.className = "article-title";
      const link = document.createElement("a");
      link.href = article.content_urls.desktop.page;
      link.target = "_blank";
      link.textContent = article.title;
      link.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
      });
      title.appendChild(link);
      overlay.appendChild(title);
  
      const heartIcon = document.createElement("div");
      heartIcon.className = "heart-icon";
      
      // Check if this article is already liked
      const likedArticles = JSON.parse(localStorage.getItem("likedArticles")) || [];
      const isLiked = likedArticles.some(a => a.title === article.title);
      
      // Use the same character (filled heart) for both states
      heartIcon.innerHTML = "♥"; // Always use filled heart
      
      if (isLiked) {
        heartIcon.classList.add("liked");
      } else {
        heartIcon.classList.add("unliked"); // Add a class for the unliked state
      }

      titleContainer.appendChild(title);
      titleContainer.appendChild(heartIcon);
      
      // Event listeners
      heartIcon.addEventListener("pointerdown", function(e) {
        console.log("heart icon pointerdown");
        e.stopPropagation();
      });
      
      heartIcon.addEventListener("click", function(e) {
        console.log("heart icon clicked");
        e.stopPropagation();
        e.preventDefault();
        
        // Toggle like state
        if (heartIcon.classList.contains("liked")) {
          // Unlike the article
          unlikeArticle(article);
          heartIcon.classList.remove("liked");
          heartIcon.classList.add("unliked");
        } else {
          // Like the article
          likeArticle(article);
          heartIcon.classList.add("liked");
          heartIcon.classList.remove("unliked");
        }
        
        updateLikedButtonState(); // Update button state
      });
      
      // overlay.appendChild(heartIcon);
      
      const text = document.createElement("p");
      text.className = "article-text";
      
      let textContent = article.extract.trim();
      // On mobile, if the text has more than 60 words, truncate it.
      if (window.innerWidth <= 600) {
        const words = textContent.split(/\s+/);
        if (words.length > 45) {
          textContent = words.slice(0, 45).join(" ") + " ...";
        }
      }
      text.textContent = textContent;
      
      // If the intro text is very short, add the 'short-text' class for alternative positioning.
      if (article.extract.trim().length < 100) {
        overlay.classList.add("short-text");
      }
      
      overlay.appendChild(titleContainer);
      overlay.appendChild(text);
  
      card.appendChild(overlay);
  
      // Preload the category for this article.
      preloadCategoryForArticle(article, card);
  
      // Attach horizontal swipe detection.
      attachSwipeDetection(card, article);
  
      // *** NEW: Attach a double-click event handler for global mode toggle ***
      card.addEventListener("dblclick", function (e) {
        e.preventDefault();
        globalShrunk = !globalShrunk;
        updateAllCardsViewMode();
      });
      
      // Ensure new cards follow the current global viewing mode.
      if (globalShrunk) {
        card.classList.add("shrunk");
      }
      
      // Add double tap support for mobile
      let lastTap = 0;
      card.addEventListener("touchstart", function(e) {
          const currentTime = new Date().getTime();
          const tapLength = currentTime - lastTap;
          if (tapLength < 300 && tapLength > 0) {
              // Double tap occurred
              e.preventDefault();
              globalShrunk = !globalShrunk;
              updateAllCardsViewMode();
          }
          lastTap = currentTime;
      });
  
      return card;
    }
  
    function addNextArticle() {
      if (articleQueue.length > 0) {
        const article = articleQueue.shift();
        const card = createArticleCard(article);
        container.appendChild(card);
  
        // Remove the initial loader overlay once the first article is added.
        removeInitialLoader();
  
        // Ensure that there are always at least PRELOAD_COUNT articles preloaded.
        ensureArticlesInQueue();
  
        // Check if we need to add more articles to fill the screen
        if (container.scrollHeight <= container.clientHeight && articleQueue.length > 0) {
          // Use setTimeout to allow the DOM to update before checking again
          setTimeout(() => {
            addNextArticle();
          }, 0);
        }
      }
    }
  
    function likeArticle(article) {
      let liked = JSON.parse(localStorage.getItem("likedArticles")) || [];
      if (!liked.find((a) => a.title === article.title)) {
        liked.push(article);
        localStorage.setItem("likedArticles", JSON.stringify(liked));
      }
    }
  
    // Add this function to unlike an article
    function unlikeArticle(article) {
      let liked = JSON.parse(localStorage.getItem("likedArticles")) || [];
      liked = liked.filter(a => a.title !== article.title);
      localStorage.setItem("likedArticles", JSON.stringify(liked));
    }
  
    // --------------------
    // PRELOAD CATEGORY FOR AN ARTICLE
    // --------------------
    function preloadCategoryForArticle(article, card = null) {
      // Check if we already have the category for this article
      if (articleCategoryCache[article.title]) {
        const cachedCategory = articleCategoryCache[article.title];
        
        // If we have a card, set its dataset
        if (card) {
          card.dataset.category = cachedCategory;
        }
        
        // Preload the category members if not already preloaded
        if (!preloadedCategories[cachedCategory]) {
          fetchCategoryMembers(cachedCategory).then((members) => {
            preloadedCategories[cachedCategory] = members;
            
            // Also preload the first article for this category
            preloadFirstCategoryArticle(cachedCategory);
          });
        }
        
        return Promise.resolve(cachedCategory);
      }
      
      // If not cached, get the category and preload it
      return getMainCategory(article).then((category) => {
        if (category) {
          // Cache the category for this article
          articleCategoryCache[article.title] = category;
          
          // If we have a card, set its dataset
          if (card) {
            card.dataset.category = category;
          }
          
          // Preload the category members if not already preloaded
          if (!preloadedCategories[category]) {
            fetchCategoryMembers(category).then((members) => {
              preloadedCategories[category] = members;
              
              // Also preload the first article for this category
              preloadFirstCategoryArticle(category);
            });
          }
        }
        return category;
      });
    }
  
    // --------------------
    // SWIPE DETECTION ON MAIN FEED CARDS
    // --------------------
    function attachSwipeDetection(card, article) {
      // Set this card's article as the current one when it becomes visible
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            currentMainArticle = article;
            
            // Only update the category overlay if it exists AND we're not actively scrolling in it
            if (currentCategoryOverlay && card.dataset.category && 
                card.dataset.category !== currentCategoryName && 
                !isCategoryScrolling) {  // Add this check
              // Update the category overlay to match the current article
              updateCategoryOverlay(card.dataset.category);
            }
          }
        });
      }, {
        threshold: 0.5 // Trigger when card is at least 50% visible
      });
      
      observer.observe(card);
      
      // Attach the swipe detection as before
      attachSmoothSwipeDetection(card, "main", article);
    }
  
    // --------------------
    // FETCH MAIN CATEGORY FOR AN ARTICLE
    // --------------------
    async function getMainCategory(article) {
      // Check if we already have the category for this article
      if (articleCategoryCache[article.title]) {
        return articleCategoryCache[article.title];
      }
      
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&prop=categories&titles=${encodeURIComponent(article.title)}&format=json&origin=*&cllimit=10&clshow=!hidden`;
        const response = await fetch(url);
        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        const page = pages[pageId];
        if (page.categories && page.categories.length > 0) {
          let catTitle = page.categories[0].title;
          if (catTitle.startsWith("Category:")) {
            catTitle = catTitle.replace("Category:", "");
          }
          
          // Cache the result
          articleCategoryCache[article.title] = catTitle;
          
          return catTitle;
        } else {
          return null;
        }
      } catch (error) {
        console.error("Error fetching category:", error);
        return null;
      }
    }
  
    // --------------------
    // CATEGORY FEED FUNCTIONS
    // --------------------
    async function openCategoryFeed(category) {
      if (currentCategoryOverlay) return; // already open
      currentCategoryName = category;
      console.log("Current category name is", currentCategoryName)
      if (preloadedCategories[category]) {
        categoryMembers = preloadedCategories[category].slice();
      } else {
        categoryMembers = await fetchCategoryMembers(category);
        preloadedCategories[category] = categoryMembers.slice();
      }
  
      currentCategoryOverlay = document.createElement("div");
      currentCategoryOverlay.id = "category-overlay";
      currentCategoryOverlay.className = "category-overlay";
      
      // Create a header for the category title.
      const header = document.createElement("div");
      header.className = "category-header";
      header.textContent = `${category}`;
      currentCategoryOverlay.appendChild(header);
  
      // Create a vertical scroll container for category articles.
      const catContainer = document.createElement("div");
      catContainer.id = "category-container";
      catContainer.className = "category-container";
      currentCategoryOverlay.appendChild(catContainer);
  
      document.body.appendChild(currentCategoryOverlay);
  
      // Preload at least one article so that the overlay isn't blank.
      await preloadCategoryFeedArticles(catContainer, 1);
  
      // Force reflow then add the "visible" class to animate the overlay in.
      currentCategoryOverlay.offsetWidth; // force reflow
      currentCategoryOverlay.classList.add("visible");
  
      // Attach swipe detection for the category overlay
      attachSmoothSwipeDetection(currentCategoryOverlay, "category");
  
      // Continue preloading additional articles.
      preloadCategoryFeedArticles(catContainer, CATEGORY_PRELOAD_COUNT - 1);
  
      catContainer.addEventListener("scroll", function () {
        if (catContainer.scrollTop + catContainer.clientHeight >= catContainer.scrollHeight - 50) {
          preloadCategoryFeedArticles(catContainer, 5);
        }
      });
  
      // Update arrow visibility for desktop
      if (!isMobileDevice && navArrows.right && navArrows.left) {
        navArrows.right.style.display = 'none';
        navArrows.left.style.display = 'flex';
      }
    }
  
    function closeCategoryFeed() {
      if (currentCategoryOverlay) {
        document.body.removeChild(currentCategoryOverlay);
        currentCategoryOverlay = null;
        categoryMembers = [];
        currentCategoryName = "";
        // Set flag so that accidental swipe-to-open is ignored for a moment.
        recentlyClosedCategory = true;
        setTimeout(() => {
          recentlyClosedCategory = false;
        }, 500); // 500ms timeout (adjust as needed)
        
        // Update arrow visibility for desktop
        if (!isMobileDevice && navArrows.right && navArrows.left) {
          navArrows.right.style.display = 'flex';
          navArrows.left.style.display = 'none';
        }
      }
    }
  
    // Modify the attachSmoothSwipeDetection function to only enable swipe on mobile
    function attachSmoothSwipeDetection(element, type, article = null) {
      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let locked = false;
      let initialTransform = 0;
      let animationId = null;
      let touchCount = 0;
      let swipeStartCategory = null; // Add this to track the category when swipe starts
      
      // Skip attaching swipe detection on desktop for main feed
      if (type === "main" && !isMobileDevice) {
        return; // Don't attach any swipe handlers on desktop for main feed
      }
      
      // Skip attaching swipe detection on desktop for category view
      if (type === "category" && !isMobileDevice) {
        return; // Don't attach any swipe handlers on desktop for category view
      }
      
      function stopAnimation() {
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }
      
      function unify(e) {
        return e.changedTouches ? e.changedTouches[0] : e;
      }
      
      function lock(e) {
        // Skip if clicking on a link
        if (e.target.closest("a")) return;
        
        // For trackpad gestures, check if it's a two-finger gesture
        if (e.type === "touchstart") {
          touchCount = e.touches.length;
          if (touchCount < 2 && type === "main") return; // For main feed, require 2+ fingers
        }
        
        startX = unify(e).clientX;
        startY = unify(e).clientY;
        locked = true;
        
        // Store initial position
        if (type === "category") {
          initialTransform = 0; // Category overlay starts at left: 0
        } else {
          initialTransform = 0; // Main feed has no transform initially
          
          // Store the category at the start of the swipe
          if (element.dataset.category) {
            swipeStartCategory = element.dataset.category;
          } else if (article) {
            // We'll get the category later when needed
            swipeStartCategory = null;
          }
        }
        
        currentX = initialTransform;
        stopAnimation();
        
        // Capture pointer to track movement even outside the element
        if (e.pointerId !== undefined) {
          element.setPointerCapture(e.pointerId);
        }
      }
      
      function drag(e) {
        if (!locked) return;
        
        // For trackpad gestures, maintain finger count check
        if (e.type === "touchmove" && type === "main") {
          if (e.touches.length < 2) return; // Still require 2+ fingers for main feed
        }
        
        const currentClientX = unify(e).clientX;
        const dx = currentClientX - startX;
        const deltaY = unify(e).clientY - startY;
        
        // If vertical scrolling is more significant, don't interfere
        if (Math.abs(deltaY) > Math.abs(dx) && Math.abs(deltaY) > 10) {
          return;
        }
        
        e.preventDefault();
        
        // REVERSED DIRECTION: Swipe LEFT on main feed to open category
        if (type === "main" && dx < 0) {
          // Only create the temporary overlay if:
          // (a) we haven't just closed a category,
          // (b) there isn't one already, and
          // (c) the horizontal movement is significant (here >30px)
          if (!currentCategoryOverlay && article && !recentlyClosedCategory && Math.abs(dx) > 30) {
            createTemporaryCategoryOverlay(article);
          }
          
          const percentage = Math.min(Math.abs(dx) / window.innerWidth, 1);
          currentX = percentage * 100;
          
          // Apply transform to the category overlay (if it exists)
          if (currentCategoryOverlay) {
            currentCategoryOverlay.style.transition = "none";
            currentCategoryOverlay.style.left = `${100 - currentX}vw`;
          }
        } else if (type === "category" && dx > 0) {
          // REVERSED DIRECTION: Swipe RIGHT on category feed to close
          const percentage = Math.min(dx / window.innerWidth, 1);
          currentX = percentage * 100;
          
          element.style.transition = "none";
          element.style.left = `${currentX}vw`;
        }
      }
      
      async function createTemporaryCategoryOverlay(article) {
        // Use the category from when the swipe started if available
        let category = swipeStartCategory;
        
        // If we don't have a category yet, get it from the element or fetch it
        if (!category) {
          category = element.dataset.category;
          if (!category) {
            category = await getMainCategory(article);
            if (category) {
              element.dataset.category = category;
              // Save this as our swipe start category to maintain consistency
              swipeStartCategory = category;
            } else {
              return; // No category found
            }
          }
        }
        
        // Create temporary overlay
        currentCategoryName = category;
        currentCategoryOverlay = document.createElement("div");
        currentCategoryOverlay.id = "category-overlay";
        currentCategoryOverlay.className = "category-overlay";
        currentCategoryOverlay.style.left = "100vw"; // Start off-screen
        
        const header = document.createElement("div");
        header.className = "category-header";
        header.textContent = `${category}`;
        currentCategoryOverlay.appendChild(header);
        
        const catContainer = document.createElement("div");
        catContainer.id = "category-container";
        catContainer.className = "category-container";
        currentCategoryOverlay.appendChild(catContainer);
        
        // Add a loading indicator
        const loadingIndicator = document.createElement("div");
        loadingIndicator.className = "category-loading";
        loadingIndicator.textContent = "Loading articles...";
        currentCategoryOverlay.appendChild(loadingIndicator);
        
        document.body.appendChild(currentCategoryOverlay);
        
        // Ensure we have category members
        if (preloadedCategories[category]) {
          categoryMembers = preloadedCategories[category].slice();
        } else {
          categoryMembers = await fetchCategoryMembers(category);
          preloadedCategories[category] = categoryMembers.slice();
          
          // Preload the first article if not already done
          await preloadFirstCategoryArticle(category);
        }
        
        // Use the preloaded first article if available
        if (preloadedCategories[category].preloadedFirstArticle) {
          const preloadedArticle = preloadedCategories[category].preloadedFirstArticle;
          const card = document.createElement("div");
          card.className = "article-card";
          
          // Use the preloaded image directly
          if (preloadedArticle.originalimage && preloadedArticle.originalimage.source) {
            card.style.backgroundColor = "#000";
            card.style.backgroundImage = `url(${preloadedArticle.originalimage.source})`;
          } else {
            card.style.backgroundColor = "#333";
          }
          
          const overlay = document.createElement("div");
          overlay.className = "article-overlay";
          
          const titleContainer = document.createElement('div');
          titleContainer.className = 'title-container';
          
          const title = document.createElement("h2");
          title.className = "article-title";
          const link = document.createElement("a");
          link.href = preloadedArticle.content_urls.desktop.page;
          link.target = "_blank";
          link.textContent = preloadedArticle.title;
          link.addEventListener("pointerdown", function (e) {
            e.stopPropagation();
          });
          title.appendChild(link);
          
          const heartIcon = document.createElement("div");
          heartIcon.className = "heart-icon";
          
          // Check if this article is already liked
          const likedArticles = JSON.parse(localStorage.getItem("likedArticles")) || [];
          const isLiked = likedArticles.some(a => a.title === preloadedArticle.title);
          
          heartIcon.innerHTML = "♥"; // Always use filled heart
          
          if (isLiked) {
            heartIcon.classList.add("liked");
          } else {
            heartIcon.classList.add("unliked");
          }
          
          titleContainer.appendChild(title);
          titleContainer.appendChild(heartIcon);
          
          // Event listeners for heart icon
          heartIcon.addEventListener("pointerdown", function(e) {
            e.stopPropagation();
          });
          
          heartIcon.addEventListener("click", function(e) {
            e.stopPropagation();
            e.preventDefault();
            
            if (heartIcon.classList.contains("liked")) {
              unlikeArticle(preloadedArticle);
              heartIcon.classList.remove("liked");
              heartIcon.classList.add("unliked");
            } else {
              likeArticle(preloadedArticle);
              heartIcon.classList.add("liked");
              heartIcon.classList.remove("unliked");
            }
            
            updateLikedButtonState();
          });
          
          const text = document.createElement("p");
          text.className = "article-text";
          
          let textContent = preloadedArticle.extract.trim();
          if (window.innerWidth <= 600) {
            const words = textContent.split(/\s+/);
            if (words.length > 45) {
              textContent = words.slice(0, 45).join(" ") + " ...";
            }
          }
          text.textContent = textContent;
          
          if (preloadedArticle.extract.trim().length < 100) {
            overlay.classList.add("short-text");
          }
          
          overlay.appendChild(titleContainer);
          overlay.appendChild(text);
          
          card.appendChild(overlay);
          catContainer.appendChild(card);
          
          // Mark this article as used
          const firstArticleTitle = preloadedArticle.title;
          categoryMembers = categoryMembers.filter(member => 
            member.title !== firstArticleTitle
          );
          
          loadingIndicator.style.display = "none";
        } else {
          // Otherwise load the first article now
          catContainer.classList.add("loading");
          await preloadCategoryFeedArticles(catContainer, 1);
          catContainer.classList.remove("loading");
          loadingIndicator.style.display = "none";
        }
      }
      
      function animateToPosition(from, to, callback) {
        const duration = 300; // ms
        const startTime = performance.now();
        
        function animate(time) {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Use bounce-out easing function
          const eased = bounceOut(progress);
          const current = from + (to - from) * eased;
          
          if (progress < 1) {
            if (type === "category") {
              element.style.left = `${current}vw`;
            } else if (currentCategoryOverlay) {
              currentCategoryOverlay.style.left = `${100 - current}vw`;
            }
            animationId = requestAnimationFrame(animate);
          } else {
            if (type === "category") {
              element.style.left = `${to}vw`;
            } else if (currentCategoryOverlay) {
              currentCategoryOverlay.style.left = `${100 - to}vw`;
            }
            stopAnimation();
            if (callback) callback();
          }
        }
        
        animationId = requestAnimationFrame(animate);
      }
      
      function bounceOut(k, a = 2.75, b = 1.5) {
        return 1 - Math.pow(1 - k, a) * Math.abs(Math.cos(Math.pow(k, b) * (2 + 0.5) * Math.PI));
      }
      
      function move(e) {
        if (!locked) return;
        locked = false;
        
        // For trackpad gestures, check if it's still a two-finger gesture
        if (e.type === "touchend" && type === "main") {
          if (touchCount < 2) return; // Still require 2+ fingers for main feed
        }
        
        const dx = unify(e).clientX - startX;
        const absDx = Math.abs(dx);
        const threshold = window.innerWidth * 0.2; // 20% of screen width
        
        // REVERSED DIRECTION: Swipe LEFT on main feed to open category
        if (type === "main" && dx < 0 && absDx > threshold) {
          // Complete the swipe left to open category
          animateToPosition(currentX, 100, async function() {
            if (currentCategoryOverlay) {
              currentCategoryOverlay.style.transition = "";
              currentCategoryOverlay.classList.add("visible");
              
              // Now fully initialize the category feed
              // Use the category from when the swipe started
              const category = swipeStartCategory || element.dataset.category;
              if (category) {
                // Preload category content
                if (preloadedCategories[category]) {
                  categoryMembers = preloadedCategories[category].slice();
                } else {
                  categoryMembers = await fetchCategoryMembers(category);
                  preloadedCategories[category] = categoryMembers.slice();
                }
                
                const catContainer = document.getElementById("category-container");
                
                // Attach swipe detection to the category overlay
                attachSmoothSwipeDetection(currentCategoryOverlay, "category");
                
                // Preload category articles
                await preloadCategoryFeedArticles(catContainer, CATEGORY_PRELOAD_COUNT);
                
                catContainer.addEventListener("scroll", function () {
                  if (catContainer.scrollTop + catContainer.clientHeight >= catContainer.scrollHeight - 50) {
                    preloadCategoryFeedArticles(catContainer, 5);
                  }
                });
              }
            }
          });
        } else if (type === "main" && dx < 0 && absDx <= threshold) {
          // Cancel the swipe left - not enough movement
          if (currentCategoryOverlay) {
            animateToPosition(currentX, 0, function() {
              if (currentCategoryOverlay) {
                document.body.removeChild(currentCategoryOverlay);
                currentCategoryOverlay = null;
                categoryMembers = [];
                currentCategoryName = "";
              }
            });
          }
        } else if (type === "category" && dx > 0 && absDx > threshold) {
          // REVERSED DIRECTION: Complete the swipe right to close category
          animateToPosition(currentX, 100, function() {
            closeCategoryFeed();
          });
        } else if (type === "category" && dx > 0 && absDx <= threshold) {
          // Cancel the swipe right - not enough movement
          animateToPosition(currentX, 0);
        }
        
        // Reset
        startX = null;
        touchCount = 0;
      }
      
      // Add event listeners for pointer events (mouse/touch)
      element.addEventListener("pointerdown", lock);
      element.addEventListener("pointermove", drag);
      element.addEventListener("pointerup", move);
      element.addEventListener("pointercancel", move);
      
      // Add specific touch events for better multi-touch support
      element.addEventListener("touchstart", lock);
      element.addEventListener("touchmove", drag);
      element.addEventListener("touchend", move);
      
      // Modify wheel event to only work on mobile
      element.addEventListener("wheel", function(e) {
        // Skip on desktop
        if (!isMobileDevice) return;
        
        // Only handle horizontal scrolling with trackpad
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 5) {
          e.preventDefault();
          
          if (type === "main" && e.deltaX > 0) {
            // Simulate left swipe on main feed to open category
            if (!locked) {
              startX = e.clientX;
              startY = e.clientY;
              locked = true;
              currentX = 0;
              
              // Store the category at the start of the wheel gesture
              if (element.dataset.category) {
                swipeStartCategory = element.dataset.category;
              }
            }
            
            currentX += Math.min(e.deltaX / 10, 5); // Scale the movement
            
            if (currentX >= window.innerWidth * 0.2) {
              // Check that we don't re-open immediately after closing the overlay
              if (!currentCategoryOverlay && !recentlyClosedCategory) {
                // Use the stored swipe start category
                const categoryToUse = swipeStartCategory || element.dataset.category;
                if (categoryToUse) {
                  createTemporaryCategoryOverlay({ title: categoryToUse });
                  animateToPosition(currentX, 100, async function() {
                    if (currentCategoryOverlay) {
                      currentCategoryOverlay.style.transition = "";
                      currentCategoryOverlay.classList.add("visible");
                      
                      const category = element.dataset.category;
                      if (category) {
                        if (preloadedCategories[category]) {
                          categoryMembers = preloadedCategories[category].slice();
                        } else {
                          categoryMembers = await fetchCategoryMembers(category);
                          preloadedCategories[category] = categoryMembers.slice();
                        }
                        
                        const catContainer = document.getElementById("category-container");
                        attachSmoothSwipeDetection(currentCategoryOverlay, "category");
                        await preloadCategoryFeedArticles(catContainer, CATEGORY_PRELOAD_COUNT);
                        
                        catContainer.addEventListener("scroll", function () {
                          if (catContainer.scrollTop + catContainer.clientHeight >= catContainer.scrollHeight - 50) {
                            preloadCategoryFeedArticles(catContainer, 5);
                          }
                        });
                      }
                    }
                  });
                }
              }
            }
          } else if (type === "category" && e.deltaX < 0) {
            // Simulate right swipe on category to close
            if (!locked) {
              startX = e.clientX;
              startY = e.clientY;
              locked = true;
              currentX = 0;
            }
            
            currentX += Math.min(Math.abs(e.deltaX) / 10, 5);
            
            if (currentX >= window.innerWidth * 0.2) {
              animateToPosition(0, 100, function() {
                closeCategoryFeed();
                locked = false;
                currentX = 0;
              });
            }
          }
        }
      }, { passive: false });
    }
  
    async function fetchCategoryMembers(category) {
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(category)}&cmlimit=50&format=json&origin=*`;
        const response = await fetch(url);
        const data = await response.json();
        const members = data.query.categorymembers;
        return members;
      } catch (error) {
        console.error("Error fetching category members:", error);
        return [];
      }
    }
  
    // Modify the preloadCategoryFeedArticles function to add scroll event listeners
    async function preloadCategoryFeedArticles(catContainer, count) {
      console.log("Preloading category feed articles for", currentCategoryName)
      console.log("cat container and count are", catContainer, count)
      
      // Add scroll tracking if not already added
      if (!catContainer.hasScrollListener) {
        catContainer.addEventListener("scroll", function() {
          // Set scrolling flag to true when scrolling starts
          isCategoryScrolling = true;
          
          // Clear any existing timeout
          if (categoryScrollTimeout) {
            clearTimeout(categoryScrollTimeout);
          }
          
          // Set a timeout to reset the scrolling flag after scrolling stops
          categoryScrollTimeout = setTimeout(() => {
            isCategoryScrolling = false;
          }, 500); // 500ms after scrolling stops
          
          // Original scroll logic for infinite loading
          if (catContainer.scrollTop + catContainer.clientHeight >= catContainer.scrollHeight - 50) {
            preloadCategoryFeedArticles(catContainer, 5);
          }
        });
        
        catContainer.hasScrollListener = true;
      }
      
      if (categoryMembers.length === 0) {
        categoryMembers = await fetchCategoryMembers(currentCategoryName);
        categoryMembers.sort(() => Math.random() - 0.5);
      }
      
      // If we already have articles loaded and this is the first load request,
      // we can skip (the preloaded first article is already there)
      if (count === 1 && catContainer.childElementCount > 0) {
        return;
      }
      
      // Keep track of article titles we've already displayed
      const displayedTitles = new Set();
      
      // Add existing article titles to our tracking set
      Array.from(catContainer.querySelectorAll('.article-card')).forEach(card => {
        const titleElement = card.querySelector('.article-title a');
        if (titleElement && titleElement.textContent) {
          displayedTitles.add(titleElement.textContent);
        }
      });
      
      let loaded = 0;
      while (loaded < count && categoryMembers.length > 0) {
        const member = categoryMembers.pop();
        if (member.ns !== 0) continue; // skip non-main articles
        
        try {
          const response = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(member.title)}`
          );
          const article = await response.json();
          
          // Skip this article if we've already displayed it
          if (displayedTitles.has(article.title)) {
            continue;
          }
          
          if (article && article.originalimage && article.originalimage.source) {
            const card = createArticleCard(article);
            catContainer.appendChild(card);
            displayedTitles.add(article.title);
            loaded++;
          }
        } catch (error) {
          console.error("Error fetching category article summary:", error);
        }
      }
    }
  
    // New function to preload categories for queued articles
    async function preloadCategoriesForQueuedArticles() {
      // Process the first few articles in the queue
      const articlesToProcess = categoryPreloadQueue.slice(0, CATEGORY_AHEAD_PRELOAD);
      
      // For each article, preload its category
      for (const article of articlesToProcess) {
        const category = await getMainCategory(article);
        if (category && !preloadedCategories[category]) {
          // Fetch and store category members
          const members = await fetchCategoryMembers(category);
          preloadedCategories[category] = members.slice();
          
          // Preload the first article for this category
          await preloadFirstCategoryArticle(category);
        }
      }
      
      // Remove processed articles from the queue
      categoryPreloadQueue = categoryPreloadQueue.slice(CATEGORY_AHEAD_PRELOAD);
    }
  
    // New function to preload just the first article for a category
    async function preloadFirstCategoryArticle(category) {
      if (!preloadedCategories[category] || preloadedCategories[category].length === 0) {
        return;
      }
      
      // Create a temporary container to hold the preloaded article data
      if (!preloadedCategories[category].preloadedFirstArticle) {
        preloadedCategories[category].preloadedFirstArticle = null;
        
        // Find a suitable article (with an image)
        for (let i = 0; i < Math.min(5, preloadedCategories[category].length); i++) {
          const member = preloadedCategories[category][i];
          if (member.ns !== 0) continue; // Skip non-main articles
          
          try {
            const response = await fetch(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(member.title)}`
            );
            const article = await response.json();
            if (article && article.originalimage && article.originalimage.source) {
              // Store this article as the preloaded first article
              preloadedCategories[category].preloadedFirstArticle = article;
              
              // Actually preload the image
              const img = new Image();
              img.src = article.originalimage.source;
              preloadedCategories[category].preloadedImage = img;
              
              // Wait for the image to load
              await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve; // Continue even if there's an error
              });
              
              break;
            }
          } catch (error) {
            console.error("Error preloading category first article:", error);
          }
        }
      }
    }
  
    // New function to update the category overlay when the main article changes
    async function updateCategoryOverlay(newCategory) {
      // Don't update if we're in the middle of opening a category via swipe
      // or if there's no change in category
      if (!currentCategoryOverlay || newCategory === currentCategoryName || 
          document.getElementById("category-overlay").classList.contains("animating")) {
        return;
      }
      
      // Only update if we're not actively scrolling
      if (isCategoryScrolling) {
        return;
      }
      
      console.log(`Updating category overlay from ${currentCategoryName} to ${newCategory}`);
      
      // Update the current category name
      currentCategoryName = newCategory;
      
      // Update the header text
      const header = currentCategoryOverlay.querySelector('.category-header');
      if (header) {
        header.textContent = `${newCategory}`;
      }
      
      // Get the category container
      const catContainer = document.getElementById("category-container");
      if (!catContainer) return;
      
      // Show loading indicator
      let loadingIndicator = currentCategoryOverlay.querySelector('.category-loading');
      if (!loadingIndicator) {
        loadingIndicator = document.createElement("div");
        loadingIndicator.className = "category-loading";
        loadingIndicator.textContent = "Loading articles...";
        currentCategoryOverlay.appendChild(loadingIndicator);
      } else {
        loadingIndicator.style.display = "block";
      }
      
      // Clear existing articles
      catContainer.innerHTML = '';
      catContainer.classList.add("loading");
      
      // Load new category members
      if (preloadedCategories[newCategory]) {
        categoryMembers = preloadedCategories[newCategory].slice();
      } else {
        categoryMembers = await fetchCategoryMembers(newCategory);
        preloadedCategories[newCategory] = categoryMembers.slice();
      }
      
      // Load the first article (use preloaded if available)
      if (preloadedCategories[newCategory].preloadedFirstArticle) {
        const card = createArticleCard(preloadedCategories[newCategory].preloadedFirstArticle);
        catContainer.appendChild(card);
        
        // Mark this article as used
        const firstArticleTitle = preloadedCategories[newCategory].preloadedFirstArticle.title;
        categoryMembers = categoryMembers.filter(member => 
          member.title !== firstArticleTitle
        );
      } else {
        // Otherwise load the first article now
        await preloadCategoryFeedArticles(catContainer, 1);
      }
      
      // Hide loading indicator and continue loading more articles
      loadingIndicator.style.display = "none";
      catContainer.classList.remove("loading");
      
      // Preload more articles
      preloadCategoryFeedArticles(catContainer, CATEGORY_PRELOAD_COUNT - 1);
    }
  
    // --------------------
    // EVENT LISTENERS
    // --------------------
    container.addEventListener("scroll", function () {
      // Use a much larger threshold (800px) to preload main feed articles earlier
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 800) {
        addNextArticle();
      }
      
      // Check for any cards that need image loading
      preloadVisibleAndUpcomingImages();
      
      // Always ensure we have enough articles in the queue
      ensureArticlesInQueue();
    });
  
    document.getElementById("view-liked-btn").addEventListener("click", function () {
      const liked = JSON.parse(localStorage.getItem("likedArticles")) || [];
      
      // Create liked articles overlay (even if there are no likes)
      let likedOverlay = document.getElementById("liked-overlay");
      
      // If overlay doesn't exist, create it
      if (!likedOverlay) {
        likedOverlay = document.createElement("div");
        likedOverlay.id = "liked-overlay";
        
        const header = document.createElement("div");
        header.className = "liked-header";
        header.textContent = "Liked Articles";
        likedOverlay.appendChild(header);
        
        const closeBtn = document.createElement("button");
        closeBtn.className = "close-liked-btn";
        closeBtn.innerHTML = "×";
        closeBtn.addEventListener("click", function() {
          document.body.removeChild(likedOverlay);
        });
        likedOverlay.appendChild(closeBtn);
        
        // Create action buttons container
        const actionContainer = document.createElement("div");
        actionContainer.className = "liked-actions";
        
        // Add Clear Likes button
        const clearBtn = document.createElement("button");
        clearBtn.className = "liked-action-btn clear-btn";
        clearBtn.textContent = "Clear All Likes";
        clearBtn.addEventListener("click", function() {
          // No confirmation dialog - just clear likes
          localStorage.setItem("likedArticles", JSON.stringify([]));
          updateLikedButtonState();
          
          // Clear the container instead of removing the overlay
          const likedContainer = likedOverlay.querySelector(".liked-container");
          likedContainer.innerHTML = "";
          
          // Add a message for empty state
          const emptyMessage = document.createElement("div");
          emptyMessage.className = "empty-likes-message";
          emptyMessage.textContent = "You haven't liked any articles yet.";
          likedContainer.appendChild(emptyMessage);
          
          // Reset all heart icons on the page to unliked state
          document.querySelectorAll(".heart-icon.liked").forEach(heart => {
            heart.classList.remove("liked");
            heart.classList.add("unliked");
          });
        });
        actionContainer.appendChild(clearBtn);
        
        // Add Export Likes button
        const exportBtn = document.createElement("button");
        exportBtn.className = "liked-action-btn export-btn";
        exportBtn.textContent = "Export as Markdown";
        exportBtn.addEventListener("click", function() {
          const liked = JSON.parse(localStorage.getItem("likedArticles")) || [];
          
          if (liked.length === 0) {
            // If no likes, do nothing
            return;
          }
          
          let markdown = "# My Liked Wikipedia Articles\n\n";
          
          liked.forEach(article => {
            markdown += `- [${article.title}](${article.content_urls.desktop.page})\n`;
          });
          
          // Create downloadable file
          const blob = new Blob([markdown], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'liked-wikipedia-articles.md';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
        actionContainer.appendChild(exportBtn);
        
        likedOverlay.appendChild(actionContainer);
        
        const likedContainer = document.createElement("div");
        likedContainer.className = "liked-container";
        likedOverlay.appendChild(likedContainer);
        
        document.body.appendChild(likedOverlay);
      }
      
      // Get the container and clear it
      const likedContainer = likedOverlay.querySelector(".liked-container");
      likedContainer.innerHTML = "";
      
      // If there are no likes, show a message
      if (liked.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "empty-likes-message";
        emptyMessage.textContent = "You haven't liked any articles yet.";
        likedContainer.appendChild(emptyMessage);
      } else {
        // Add each liked article to the container
        liked.forEach(article => {
          const articleItem = document.createElement("div");
          articleItem.className = "liked-article-item";
          
          // Create originalimage if available
          if (article.originalimage && article.originalimage.source) {
            const originalimage = document.createElement("div");
            originalimage.className = "liked-article-originalimage";
            originalimage.style.backgroundImage = `url(${article.originalimage.source})`;
            articleItem.appendChild(originalimage);
          }
          
          // Create article info
          const info = document.createElement("div");
          info.className = "liked-article-info";
          
          const title = document.createElement("h3");
          const link = document.createElement("a");
          link.href = article.content_urls.desktop.page;
          link.target = "_blank";
          link.textContent = article.title;
          title.appendChild(link);
          info.appendChild(title);
          
          const excerpt = document.createElement("p");
          excerpt.textContent = article.extract.substring(0, 100) + "...";
          info.appendChild(excerpt);
          
          articleItem.appendChild(info);
          likedContainer.appendChild(articleItem);
        });
      }
      
      // Show the overlay
      likedOverlay.classList.add("visible");
    });
  
    // Modify the updateLikedButtonState function to remove the disabled functionality
    function updateLikedButtonState() {
      // No longer applying disabled class based on number of likes
      // This function only exists to track changes in liked articles
    }
  
    // --------------------
    // INITIALIZE MAIN FEED
    // --------------------
    preloadArticles(PRELOAD_COUNT);
  
    // Set initial state of the View Liked button
    updateLikedButtonState();

    // Helper function to remove the initial loader overlay.
    function removeInitialLoader() {
      const loader = document.getElementById("initial-loader");
      if (loader) {
        loader.remove();
      }
    }

    // Info window event handling
    const infoBtn = document.getElementById("info-btn");
    const infoWindow = document.getElementById("info-window");
    const closeInfoBtn = document.getElementById("close-info-btn");

    infoBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      // Toggle info window visibility
      if (infoWindow.style.display === "block") {
        infoWindow.style.display = "none";
      } else {
        infoWindow.style.display = "block";
      }
    });

    closeInfoBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      infoWindow.style.display = "none";
    });

    // Add this function to preload images for visible and nearly-visible cards
    function preloadVisibleAndUpcomingImages() {
      // Get all article cards
      const cards = document.querySelectorAll('.article-card');
      
      // Set up an observer to monitor cards
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const card = entry.target;
          // If card has an image URL but no background image
          if (card.dataset.imageUrl && !card.style.backgroundImage.includes(card.dataset.imageUrl)) {
            // Force load the image
            const img = new Image();
            img.fetchPriority = "high";
            img.onload = function() {
              card.style.backgroundImage = `url(${card.dataset.imageUrl})`;
              const spinner = card.querySelector('.spinner');
              if (spinner) spinner.remove();
            };
            img.src = card.dataset.imageUrl;
          }
        });
      }, {
        rootMargin: "1000px 0px" // Check cards up to 1000px away
      });
      
      // Observe all cards
      cards.forEach(card => observer.observe(card));
    }

    // Create navigation arrows for desktop
    function createNavigationArrows() {
      console.log("creating navigation arrows")
      // Create right arrow for main feed
      navArrows.right = document.createElement('div');
      navArrows.right.className = 'nav-arrow nav-arrow-right';
      navArrows.right.innerHTML = '&rsaquo;';
      navArrows.right.title = 'View category';
      navArrows.right.style.zIndex = '2500'; // Higher than category overlay
      document.body.appendChild(navArrows.right);
      
      // Create left arrow for category view
      navArrows.left = document.createElement('div');
      navArrows.left.className = 'nav-arrow nav-arrow-left';
      navArrows.left.innerHTML = '&lsaquo;';
      navArrows.left.title = 'Return to main feed';
      navArrows.left.style.display = 'none'; // Hidden initially
      navArrows.left.style.zIndex = '2500'; // Higher than category overlay
      document.body.appendChild(navArrows.left);
      
      // Add event listeners
      navArrows.right.addEventListener('click', async function() {
        if (currentMainArticle) {
          const category = await getMainCategory(currentMainArticle);
          if (category) {
            openCategoryFeed(category);
          }
        }
      });
      
      navArrows.left.addEventListener('click', function() {
        closeCategoryFeed();
      });
      
      // Initial visibility based on device type
      updateArrowVisibility();
    }

    // Function to update arrow visibility based on device type
    function updateArrowVisibility() {
      if (navArrows.right && navArrows.left) {
        if (isMobileDevice) {
          navArrows.right.style.display = 'none';
          navArrows.left.style.display = 'none';
        } else {
          // On desktop, show appropriate arrow based on current view
          if (currentCategoryOverlay) {
            navArrows.right.style.display = 'none';
            navArrows.left.style.display = 'flex';
          } else {
            navArrows.right.style.display = 'flex';
            navArrows.left.style.display = 'none';
          }
        }
      }
    }

    // Call createNavigationArrows in the initialization section
    createNavigationArrows();

    // Make sure to call createNavigationArrows after DOM is loaded
    setTimeout(createNavigationArrows, 500); // Add a small delay to ensure DOM is ready
  });
  