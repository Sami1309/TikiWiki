document.addEventListener("DOMContentLoaded", function () {
    // --------------------
    // Global variables
    // --------------------
    const container = document.getElementById("article-container");
    let articleQueue = [];
    const PRELOAD_COUNT = 10; // for main feed
  
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
      for (let i = 0; i < count; i++) {
        fetchRandomArticle().then((article) => {
          if (article) {
            articleQueue.push(article);
            if (container.childElementCount < 2) {
              addNextArticle();
            }
          }
        });
      }
    }
  
    function createArticleCard(article) {
      const card = document.createElement("div");
      card.className = "article-card";
  
      if (article.thumbnail && article.thumbnail.source) {
        card.style.backgroundImage = `url(${article.thumbnail.source})`;
      } else {
        card.style.backgroundColor = "#333";
      }
  
      const likeBtn = document.createElement("button");
      likeBtn.className = "like-button";
      likeBtn.textContent = "Like";
      likeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        likeArticle(article);
        likeBtn.textContent = "Liked";
        likeBtn.disabled = true;
      });
      card.appendChild(likeBtn);
  
      const overlay = document.createElement("div");
      overlay.className = "article-overlay";
  
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
  
      const text = document.createElement("p");
      text.className = "article-text";
      text.textContent = article.extract;
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
  
      return card;
    }
  
    function addNextArticle() {
      if (articleQueue.length > 0) {
        const article = articleQueue.shift();
        const card = createArticleCard(article);
        container.appendChild(card);
  
        if (
          container.scrollHeight <= container.clientHeight &&
          articleQueue.length > 0
        ) {
          addNextArticle();
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
  
    // --------------------
    // PRELOAD CATEGORY FOR AN ARTICLE
    // --------------------
    function preloadCategoryForArticle(article, card) {
      if (!card.dataset.category) {
        getMainCategory(article).then((category) => {
          if (category) {
            card.dataset.category = category;
            if (!preloadedCategories[category]) {
              fetchCategoryMembers(category).then((members) => {
                preloadedCategories[category] = members;
              });
            }
          }
        });
      }
    }
  
    // --------------------
    // SWIPE DETECTION ON MAIN FEED CARDS
    // --------------------
    function attachSwipeDetection(card, article) {
      attachSmoothSwipeDetection(card, "main", article);
    }
  
    // --------------------
    // FETCH MAIN CATEGORY FOR AN ARTICLE
    // --------------------
    async function getMainCategory(article) {
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
      header.textContent = `Category: ${category}`;
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
    }
  
    function closeCategoryFeed() {
      if (!currentCategoryOverlay) return;
      currentCategoryOverlay.classList.remove("visible");
      currentCategoryOverlay.addEventListener(
        "transitionend",
        function () {
          if (currentCategoryOverlay) {
            document.body.removeChild(currentCategoryOverlay);
            currentCategoryOverlay = null;
            categoryMembers = [];
            currentCategoryName = "";
          }
        },
        { once: true }
      );
    }
  
    // Replace the attachSmoothSwipeDetection function with this updated version
    function attachSmoothSwipeDetection(element, type, article = null) {
      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let locked = false;
      let initialTransform = 0;
      let animationId = null;
      let touchCount = 0;
      
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
          // Swiping left on main feed - prepare to open category
          const percentage = Math.min(Math.abs(dx) / window.innerWidth, 1);
          currentX = percentage * 100;
          
          // Apply transform to the category overlay (which should be created temporarily)
          if (!currentCategoryOverlay && article) {
            // Create temporary overlay for animation
            createTemporaryCategoryOverlay(article);
          }
          
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
        let category = element.dataset.category;
        if (!category) {
          category = await getMainCategory(article);
          if (category) {
            element.dataset.category = category;
          } else {
            return; // No category found
          }
        }
        
        // Create temporary overlay (similar to openCategoryFeed but without full initialization)
        currentCategoryName = category;
        currentCategoryOverlay = document.createElement("div");
        currentCategoryOverlay.id = "category-overlay";
        currentCategoryOverlay.className = "category-overlay";
        currentCategoryOverlay.style.left = "100vw"; // Start off-screen
        
        const header = document.createElement("div");
        header.className = "category-header";
        header.textContent = `Category: ${category}`;
        currentCategoryOverlay.appendChild(header);
        
        const catContainer = document.createElement("div");
        catContainer.id = "category-container";
        catContainer.className = "category-container";
        currentCategoryOverlay.appendChild(catContainer);
        
        document.body.appendChild(currentCategoryOverlay);
        
        // Don't add the visible class yet - we're manually controlling position
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
              const category = element.dataset.category;
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
      
      // Add wheel event for trackpad gestures
      element.addEventListener("wheel", function(e) {
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
            }
            
            // Accumulate the swipe distance
            currentX += Math.min(e.deltaX / 10, 5); // Scale the movement
            
            if (currentX >= window.innerWidth * 0.2) {
              // If we've moved enough, trigger the category open
              if (!currentCategoryOverlay && element.dataset.category) {
                createTemporaryCategoryOverlay({title: element.dataset.category});
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
                  locked = false;
                  currentX = 0;
                });
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
            
            // Accumulate the swipe distance
            currentX += Math.min(Math.abs(e.deltaX) / 10, 5); // Scale the movement
            
            if (currentX >= window.innerWidth * 0.2) {
              // If we've moved enough, trigger the category close
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
  
    async function preloadCategoryFeedArticles(catContainer, count) {
      if (categoryMembers.length === 0) {
        categoryMembers = await fetchCategoryMembers(currentCategoryName);
        categoryMembers.sort(() => Math.random() - 0.5);
      }
      let loaded = 0;
      while (loaded < count && categoryMembers.length > 0) {
        const member = categoryMembers.pop();
        if (member.ns !== 0) continue; // skip non-main articles (including the category page)
        try {
          const response = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(member.title)}`
          );
          const article = await response.json();
          if (article && article.thumbnail && article.thumbnail.source) {
            const card = createArticleCard(article);
            catContainer.appendChild(card);
            loaded++;
          }
        } catch (error) {
          console.error("Error fetching category article summary:", error);
        }
      }
    }
  
    // --------------------
    // EVENT LISTENERS
    // --------------------
    container.addEventListener("scroll", function () {
      // Use a larger threshold (200px) to preload main feed articles earlier.
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 200) {
        addNextArticle();
        if (articleQueue.length < PRELOAD_COUNT) {
          preloadArticles(PRELOAD_COUNT - articleQueue.length);
        }
      }
    });
  
    document.getElementById("view-liked-btn").addEventListener("click", function () {
      const liked = JSON.parse(localStorage.getItem("likedArticles")) || [];
      if (liked.length === 0) {
        alert("No liked articles yet!");
      } else {
        const titles = liked.map((a) => a.title).join("\n");
        alert("Liked Articles:\n" + titles);
      }
    });
  
    // --------------------
    // INITIALIZE MAIN FEED
    // --------------------
    preloadArticles(PRELOAD_COUNT);
  });
  