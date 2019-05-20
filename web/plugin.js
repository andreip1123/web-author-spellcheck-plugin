(function () {

  var cssFile;
  cssFile = goog.dom.createDom('link');
  cssFile.rel = "stylesheet";
  cssFile.type = "text/css";
  cssFile.href = "../plugin-resources/man-sp/custom.css";
  goog.dom.appendChild(document.head, cssFile);

  var selectedMarkerClass = 'spelling-selected';
 goog.events.listenOnce(workspace, sync.api.Workspace.EventType.BEFORE_EDITOR_LOADED,
     function(e) {
   var editor = e.editor;

   // Register the newly created action.
   editor.getActionsManager().registerAction(spellingDialogActionId, new SpellcheckAction(editor));
   addToMoreToolbar(editor, spellingDialogActionId);
 });


 /**
  * The action that shows a popup and then inserts the text in the pop-up.
  */
 function SpellcheckAction (editor) {
   sync.actions.AbstractAction.call(this, 'F7');
   this.editor_ = editor;
   this.dialog_ = null;

   this.wordInput_ = null;
   this.replaceInput_ = null;
   this.suggestionsBox_ = null;

   this.eventHandler_ = new goog.events.EventHandler(this);
   this.dialogOpenHandler_ = new goog.events.EventHandler(this);

   this.transparenceClass_ = 'man-sp-transparence';

   this.replaceButton_ = null;
   this.replaceAllButton_ = null;
   this.ignoreButton_ = null;
 }
 // shortcut is Meta+L on Mac and Ctrl+L on other platforms.
 SpellcheckAction.prototype = Object.create(sync.actions.AbstractAction.prototype);
 SpellcheckAction.prototype.constructor = SpellcheckAction;

 SpellcheckAction.prototype.getLargeIcon = function () {
   var icon = 'SpellCheck24.png';
   if (document.querySelector('.no-app-bar')) {
    icon = 'Blue_SpellCheck24.png';
   }
   return sync.util.computeHdpiIcon('../plugin-resources/man-sp/' + icon);
 };

  SpellcheckAction.prototype.getDescription = function() {
    return tr(msgs.SPELL_CHECK_ACTION_);
  };

 SpellcheckAction.prototype.getDisplayName = function() {
   return tr(msgs.SPELL_CHECK_ACTION_);
 };

 SpellcheckAction.prototype.showInfo_ = function (message) {
   this.editor_.problemReporter && this.editor_.problemReporter.showInfo(message);
 };

  /**
   * Make sure the selected error is visible - scroll to it and/or expand its fold.
   * @param {NodeList} nodes List of fake selection nodes.
   * @private
   */
 SpellcheckAction.prototype.scrollIntoViewIfNeeded_ = function (nodes) {
  if (nodes.length) {
    var selectedNode = nodes[0];
    var rect = selectedNode.getBoundingClientRect() || {};
    // If the selected node is hidden, try to toggle the current fold.
    if (rect.height === 0) {
      this.editor_.getActionsManager().getActionById('Author/ToggleFold').actionPerformed(function() {
        selectedNode.scrollIntoView(false);
      })
    } else {
      selectedNode.scrollIntoView(false);
    }
  }
 };

  /**
   * Clear selected spellchecking error markers.
   * @private
   */
 SpellcheckAction.prototype.clearSelectedMarkers_ = function () {
   var fakeSpellcheckingSelections = document.querySelectorAll('.' + selectedMarkerClass);
   for (var j = 0; j < fakeSpellcheckingSelections.length; j++) {
     goog.dom.classlist.remove(fakeSpellcheckingSelections[j], selectedMarkerClass);
   }
 };

  /**
   * If the highlight is covered by the dialog, make the dialog partly transparent.
   * @param highlightChunks Chunks of highlighted marker.
   */
  SpellcheckAction.prototype.makeTransparentIfOverSelected_ = function (highlightChunks) {
    if (highlightChunks && highlightChunks.length > 0) {
      var overlap = false;
      var dialogElement = document.querySelector('#manual-spellcheck');
      var dialogRect = dialogElement.getBoundingClientRect();
      goog.array.find(highlightChunks, function (chunk) {
        var chunkRect = chunk.getBoundingClientRect();
        overlap = !(chunkRect.right < dialogRect.left ||
          chunkRect.left > dialogRect.right ||
          chunkRect.bottom < dialogRect.top ||
          chunkRect.top > dialogRect.bottom);
        return overlap;
      });

      if (overlap) {
        goog.dom.classlist.add(dialogElement, this.transparenceClass_);
      } else {
        this.removeTransparency_();
      }
    }
  };

  /**
   * Remove transparency from find/replace dialog.
   * @private
   */
  SpellcheckAction.prototype.removeTransparency_ = function () {
    goog.dom.classlist.remove(this.dialogElement_, this.transparenceClass_);
  };

  /**
   * Find the next error.
   * @param saveSpellcheckStartPosition Whether this is the first request after the dialog is shown.
   */
 SpellcheckAction.prototype.findNext = function (saveSpellcheckStartPosition) {
   sync.view.SelectionView.clearSelectionPlaceholder();
   var actionsManager = this.editor_.getActionsManager();
   actionsManager.invokeOperation(
     'com.oxygenxml.webapp.plugins.spellcheck.GoToNextSpellingErrorOperation', {
       'fromCaret' : true,
       'ignoredWords': this.editor_.getSpellChecker().getIgnoredWords(),
       'saveStartPosition': !!saveSpellcheckStartPosition
     }, goog.bind(function(err, resultString) {

       var result;
       try {
         result = JSON.parse(resultString);
       } catch (e) {
         result = {};
       }

       var word = result.word;
       this.wordInput_.value = word || '';
       if (word) {
         this.word_ = word;
         this.language_ = result.language;
         var suggestions = result.suggestions;
         if (suggestions) {
           this.displaySuggestions_(suggestions);
         }
         // If selection is now in readonly content, disable replace buttons.
         this.setSpellCheckButtonsEnabled_(true);
         var editorReadOnlyStatus = this.editor_.getReadOnlyStatus().isReadOnly();
         var selectionInReadOnlyContent = sync.select.evalSelectionFunction(sync.util.isInReadOnlyContent);
         if (editorReadOnlyStatus || selectionInReadOnlyContent) {
           this.replaceButton_.disabled = true;
           this.replaceAllButton_.disabled = true;
         }
       } else {
          this.clearSpellCheckSuggestions_();

         this.showInfo_(tr(msgs.NO_SPELLING_ERRORS_FOUND_));
       }

       sync.view.SelectionView.renderSelectionPlaceholder(sync.select.getSelection());
       // Consider only non-empty selection placeholder chunks for the dialog overlap check.
       var selectedMarkerChunks = document.querySelectorAll('.selection-placeholder:not(.caret-placeholder)');
       this.scrollIntoViewIfNeeded_(selectedMarkerChunks);
       this.makeTransparentIfOverSelected_(selectedMarkerChunks);
       this.replaceInput_.focus();
    }, this));
 };

  /**
   * Clear spellcheck suggestion.
   *
   * @private
   */
  SpellcheckAction.prototype.clearSpellCheckSuggestions_ = function() {
    this.replaceInput_.value = '';
    goog.dom.removeChildren(this.suggestionsBox_);
  };

  /**
   * Populate the suggestions select with options.
   * @param {Array<String>} suggestions The list of suggestions.
   * @private
   */
 SpellcheckAction.prototype.displaySuggestions_ = function (suggestions) {
   // In case of no suggestions, just clear replace with input and suggestions box.
   this.replaceInput_.value = '';
   goog.dom.removeChildren(this.suggestionsBox_);

   if (suggestions.length) {
     var suggestionElements = [];
     for (var i = 0; i < suggestions.length; i++) {
       suggestionElements.push(goog.dom.createDom('option', 'man-sp-suggestion', suggestions[i]));
     }
     // First suggestion gets added to the replace input, also marked as selected.
     this.replaceInput_.value = suggestions[0];
     suggestionElements[0].setAttribute('selected', 'selected');
     goog.dom.append(this.suggestionsBox_, suggestionElements);
   }
 };

  /**
   * If the user clicked on a suggestion, set its value to the replace input.
   * @private
   */
 SpellcheckAction.prototype.suggestionSelected_ = function () {
   this.replaceInput_.value = this.suggestionsBox_.value;
 };

  SpellcheckAction.prototype.showDialog_ = function () {
    var dialog = this.dialog_;
    if (!dialog) {
      dialog = workspace.createDialog('manual-spellcheck');
      dialog.setPreferredSize(370, 340);
      dialog.setHasTitleCloseButton(true);
      dialog.setBackgroundElementOpacity(0);
      dialog.setTitle(tr(msgs.SPELLING_));
      dialog.setResizable(true);
      dialog.setButtonConfiguration([]);
      var toolbarButton = document.querySelector('[name="' + spellingDialogActionId + '"]');
      if (toolbarButton) {
        var position = goog.style.getPageOffset(toolbarButton);
        dialog.setPosition(position.x , (position.y + toolbarButton.clientHeight));
      }

      var createDom = goog.dom.createDom;
      this.wordInput_ = createDom('input', { id: 'man-sp-word', className: 'man-sp-input', type: 'text' });
      this.wordInput_.setAttribute('readonly', 'true');
      this.replaceInput_ = createDom('input', { id: 'man-sp-replace-with', className: 'man-sp-input', type: 'text' });
      this.suggestionsBox_ = createDom('select', {
          id: 'man-sp-suggestions',
          size: 6
        }
      );

      var suggestionsLabel = goog.dom.createDom('label', { className: 'man-sp-label' }, tr(msgs.SUGGESTIONS_) + ':');
      suggestionsLabel.setAttribute('for', 'man-sp-suggestions');
      var inputsColumn = createDom('div', 'man-sp-col man-inputs',
        createDom('div', 'man-sp',
          goog.dom.createDom('div', {style: 'position: relative;'},
            goog.dom.createDom('label', { className: 'man-sp-label', for: 'man-sp-word' }, tr(msgs.MISSPELLED_WORD_) + ':')
          ),
          this.wordInput_,
          goog.dom.createDom('label', { className: 'man-sp-label' },
            tr(msgs.REPLACE_WITH_) + ':',
            this.replaceInput_
          ),
          suggestionsLabel,
          this.suggestionsBox_
        )
      );

      var createButton = function (name, caption) {
        var button = goog.dom.createDom('button', { className: 'man-sp-button oxy-button oxy-small-button' }, caption);
        goog.dom.dataset.set(button, 'spButton', name);
        return button;
      };
      this.ignoreButton_ = createButton('ignore', tr(msgs.IGNORE_));
      var ignoreAllButton = createButton('ignore_all', tr(msgs.IGNORE_ALL_));
      this.replaceButton_ = createButton('replace', tr(msgs.REPLACE_));
      this.replaceAllButton_ = createButton('replace_all', tr(msgs.REPLACE_ALL_));


      var buttonsColumn = createDom('div', 'man-sp-col man-buttons',
        this.replaceButton_,
        this.replaceAllButton_,
        this.ignoreButton_,
        ignoreAllButton
      );

      var dialogElement = dialog.getElement();
      dialogElement.setAttribute('id', 'manual-spellcheck-container');


      goog.dom.append(dialogElement,
        inputsColumn,
        buttonsColumn
      );

      var suggestionsBox = this.suggestionsBox_;
      goog.events.listen(suggestionsBox, goog.events.EventType.CHANGE,
        goog.bind(this.suggestionSelected_, this));
      goog.events.listen(suggestionsBox, goog.events.EventType.FOCUSIN, goog.bind(function () {
        var replaceWithValue = this.replaceInput_.value;
        // In case the replace with input value is the same as one of the options, update the selected option.
        // If replace with input is not one of the options, unselect options.
        if (replaceWithValue !== suggestionsBox.value) {
          suggestionsBox.selectedIndex = goog.array.findIndex(suggestionsBox.options, function (o) {
            return o.textContent === replaceWithValue;
          });
        }
      }, this));

      goog.events.listen(buttonsColumn, goog.events.EventType.CLICK, goog.bind(this.clickOnButtons_, this));

      this.eventHandler_
        .listen(dialog.getEventTarget(), goog.ui.PopupBase.EventType.SHOW, goog.bind(this.afterShow_, this))
        .listen(dialog.getEventTarget(), goog.ui.PopupBase.EventType.BEFORE_HIDE, goog.bind(this.beforeHide_, this));
      this.dialog_ = dialog;
    }

    this.setSpellCheckButtonsEnabled_(false);
    this.wordInput_.value = '';
    this.clearSpellCheckSuggestions_();
    dialog.show();
  };

  /**
   * Handle click in the buttons column.
   * @param {goog.events.EventType.CLICK} e The click event.
   * @private
   */
  SpellcheckAction.prototype.clickOnButtons_ = function (e) {
    var button = goog.dom.getAncestorByClass(e.target, 'man-sp-button');
    if (button) {
      this.setSpellCheckButtonsEnabled_(false);
      var buttonType = goog.dom.dataset.get(button, 'spButton');
      if (buttonType === 'ignore') {
        // just go to next marker.
        this.findNext();
      } else if (buttonType === 'ignore_all') {
        var language = this.language_;
        var word = this.word_;
        // Add the word to the ignore list for the language.
        this.editor_.getSpellChecker().addIgnoredWord(language, word);
        this.findNext();
      } else if (buttonType === 'replace') {
        this.replace_();
      } else if (buttonType === 'replace_all') {
        sync.rest.callAsync(RESTFindReplaceSupport.replaceAllInDocument, {
          docId: this.editor_.getController().docId,
          textToFind: this.word_,
          textToReplace: this.replaceInput_.value,
          matchCase: true,
          wholeWords: true
        }).then(goog.bind(function (e) {
          this.editor_.getController().applyUpdate_(e);
          this.findNext();
        }, this));
      }
    }
  };

  /**
   * Replace an error with the selected value.
   * @private
   */
  SpellcheckAction.prototype.replace_ = function () {
    var selection = sync.select.getSelection();
    var selectionStartRelativePosition = selection.start.toRelativeContentPosition();
    var replaceAction = new sync.spellcheck.SpellCheckReplaceAction(
      this.editor_.getController(),
      -1,
      -1,
      this.word_,
      this.replaceInput_.value,
      selectionStartRelativePosition
    );
    replaceAction.actionPerformed(goog.bind(function () {
      this.replaceInput_.focus();
      this.findNext();
    }, this));
  };

  /**
   * Activate/inactivate the spellcheck.
   *
   * @param enabled True to enable all spellcheck buttons, false for disable.
   */
  SpellcheckAction.prototype.setSpellCheckButtonsEnabled_ = function(enabled) {
    var buttons = this.dialog_.getElement().getElementsByTagName('button');
    goog.array.forEach(buttons, function (button) {
      button.disabled = !enabled;
    });
  };


  /**
   * Save last position, clear dialog open listeners and selected markers.
   * @private
   */
  SpellcheckAction.prototype.beforeHide_ = function () {
    // Save dialog sizes and position for the next time it gets shown.
    sync.view.SelectionView.clearSelectionPlaceholder();
    this.dialogOpenHandler_.removeAll();
  };

  /**
   * Set to default position first time, set dialog open listeners.
   * @private
   */
  SpellcheckAction.prototype.afterShow_ = function () {
    if (!this.dialogElement_) {
      this.dialogElement_ = document.querySelector('#manual-spellcheck');
    }

    // Register some listeners only for when dialog is shown.
    this.dialogOpenHandler_
      .listen(this.dialogElement_, goog.events.EventType.CLICK, goog.bind(this.removeTransparency_, this), true)
      .listen(this.replaceInput_, goog.events.EventType.KEYUP, goog.bind(this.doActionOnEnter_, this))
      .listen(this.suggestionsBox_, goog.events.EventType.KEYUP, goog.bind(this.doActionOnEnter_, this));
  };

  /**
   * Trigger actions on Enter while in the replace with input or suggestions select.
   * @param {goog.events.EventType.KEYUP} e The keyup event.
   * @private
   */
  SpellcheckAction.prototype.doActionOnEnter_ = function (e) {
    // On Enter do Replace if enabled, Ignore otherwise.
    if (e.keyCode === goog.events.KeyCodes.ENTER) {
      var disableButtons = false;
      if (this.replaceButton_.disabled === false) {
        disableButtons = true;
        this.replace_();
      } else if (this.ignoreButton_.disabled === false) {
        disableButtons = true;
        this.findNext();
      }
      if (disableButtons) {
        this.setSpellCheckButtonsEnabled_(false);
      }
    }
  };

 // The actual action execution.
 SpellcheckAction.prototype.actionPerformed = function(callback) {
   this.showDialog_();
   this.findNext(true);
   callback && callback();
 };


 function addToMoreToolbar(editor, actionId) {
   goog.events.listen(editor, sync.api.Editor.EventTypes.ACTIONS_LOADED, function(e) {
     var actionsConfig = e.actionsConfiguration;

     var builtinToolbar = null;
     if (actionsConfig.toolbars) {
       for (var i = 0; i < actionsConfig.toolbars.length; i++) {
         var toolbar = actionsConfig.toolbars[i];
         if (toolbar.name === "Builtin") {
           builtinToolbar = toolbar;
         }
       }
     }

     if (builtinToolbar) {
       var moreElement = goog.array.find(builtinToolbar.children, function (el) { return el.name === 'More...' });
       goog.array.insertBefore(builtinToolbar.children, {
         id: actionId,
         type: "action"
       }, moreElement);
     }
   });
 }
})();
