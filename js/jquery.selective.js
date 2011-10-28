// vi:set ts=4 sw=4 expandtab syntax=javascript:
(function($, document) {

    $.widget('ui.selective', {
        options: {
            source: undefined,
            ajaxRequestMapper: function(request) { return request },
            ajaxSuccessMapper: function(data) { return data },
            ajaxErrorMapper: function(text) { return $.parseJSON(text) },
            multiple: undefined,
            ignoreFirstOption: false,
            renderList: function(ul, items) {
                return this._renderList.apply(this, arguments);
            },
            renderItem: function(li, item, depth) {
                return this._renderItem.apply(this, arguments);
            },
            enableSearch: true,
            searchDelay: 300,
            searchMinLength: undefined,
            searchPrefetch: undefined,
            searchFirstOption: undefined,
            searchIndicatorDelay: 100,
            searchIndicatorMinVisible: 500,
            searchRequiredContent: '<span>Enter a search term to display options</span>',
            searchMessageContent: function(term) {
                return this.animateElipses('<span>Searching</span>');
            },
            searchNoResultsContent: function(term) {
                return $('<span />').text(
                    term.length? 'No results match "' + term + '"' : 'No options available');
            },
            selectedOption: undefined,
            deselectedOption: undefined
        },

        _create: function() {
            var self = this;

            this._source = this._buildSourceFunction(this.options.source);

            this._itemList = $('<ul class="selective-items" tabindex="-1" />');
            this._dropdown = $('<div class="selective-dropdown" />').append(this._itemList).hide();
            this._container = $('<div class="selective-container" tabindex="0" />').append(this._dropdown);
            this.element.hide().after(this._container);

            if (this.multiple()) {
                this._createMultiple();
            } else {
                this._createSingle();
            }

            this._control = this._container.find('.selective-control');
            this._search = this._container.find('.selective-search');
            this._searchInput = this._search.find('input');

            this._elemWidth = this.element.outerWidth();
            this._adjustSize();

            this._container
                .focus($.proxy(this._onfocus, this))
                .keydown($.proxy(this._onkeydown, this));

            this._documentFocusHandler = function(evt) {
                if (self._container.is(evt.target) || self._container.has(evt.target).length)
                    return true;
                return self._onblur.apply(self, arguments);
            };
            $(document).bind('focusin.selective click.selective', this._documentFocusHandler);
            this._documentMouseupHandler = function(evt) {
                self._mouseDragActive = false;
            };
            $(document).bind('mouseup.selective', this._documentMouseupHandler);

            this._control.mousedown(function() {
                self._container.focus();
                if (!self.multiple())
                    self.toggleDropdown();
                else
                    self.openDropdown();
                self._mouseDragActive = true;
                return false;
            });

            this._searchInput.keydown($.proxy(this._searchKeydown, this));

            this.clearListItems();

            if (this.searchPrefetch())
                this.search('');
        },

        destroy: function() {
            $(document).unbind('focusin.selective click.selective', this._documentFocusHandler);
            $(document).unbind('mouseup.selective', this._documentMouseupHandler);
            $.Widget.prototype.destroy.call(this);
        },

        _createSingle: function() {
            var selectedOption = this._selectedOptions().last() || this.element.children('option:first-child');
            var initialLabel = selectedOption.length? selectedOption.text() : (this.element.attr('title') || "");
            selectedOption.siblings().remove();
            this._container.addClass('selective-single').prepend(
                $($('<a class="selective-control" />').append(
                    $('<span />').text(initialLabel)
                )).append($('<div />').append('<b />'))
            );
            this._dropdown.prepend('<div class="selective-search"><input type="text" autocomplete="off"></input></div>');
        },

        _createMultiple: function() {
            var self = this;
            var tagList = $('<ul class="selective-control" />');

            var selectedOptions = this._selectedOptions();
            this.element.empty().append(selectedOptions);
            selectedOptions.each(function() {
                tagList.append(self._createTag($(this).text(), optionValue($(this))));
            });

            this._container.addClass('selective-multiple').prepend(tagList.append(
                $('<li class="selective-search" />').append(
                    $('<input type="text" autocomplete="off" tabindex="-1" />').val(
                        ((selectedOptions.length == 0)? this.element.attr('title') : "") || ""
                    )
                ))
            );
        },

        _setOption: function(key, value) {
            this._super('_setOption', key, value);
            if (key === 'source') {
                this._source = this._buildSourceFunction(this.options.source);
            }
        },

        _buildSourceFunction: function(source) {
            var self = this;
            var stubHandler = { abort: function() { } };

            if (source == undefined || $.isArray(source)) {
                var items = source || arrayFromSelect(this.element, this.options.ignoreFirstOption);
                var searchableItems = ((source != undefined) || this.option.ignoreFirstOption ||
                        this.searchFirstOption())? items : items.slice(1);
                return function(request, response, error) {
                    setTimeout(function() {
                        if (request.term === undefined || request.term == "")
                            response(items);
                        else
                            response(filterItems(searchableItems, request.term));
                    }, 0);
                    return $.extend({}, stubHandler);
                };
            } else if ($.isFunction(source)) {
                return function(request, response, error) {
                    return $.extend({}, stubHandler,
                        source.call(self, request, delayedProxy(response, 0), delayedProxy(error, 0))||{});
                };
            } else if (typeof source === 'string') {
                return function(request, response, error) {
                    return $.ajax({
                        url: source,
                        data: self.options.ajaxRequestMapper(request),
                        dataType: 'json',
                        success: function(data, status) {
                            response(self.options.ajaxSuccessMapper(data));
                        },
                        error: function(xhr, status) {
                            if (xhr.statusText == "error")
                                error(self.options.ajaxErrorMapper(xhr.responseText).message);
                        }
                    });
                };
            }
        },

        multiple: function() {
            if (this.options.multiple !== undefined)
                return this.options.multiple? true : false;
            return this.element.attr('multiple')? true : false;
        },

        searchEnabled: function() {
            if (this.multiple())
                return true;
            return this.options.enableSearch;
        },

        searchMinLength: function() {
            if (!this.searchEnabled())
                return 0;
            if (this.options.searchMinLength !== undefined)
                return this.options.searchMinLength;
            if (this.options.source === undefined || $.isArray(this.options.source))
                return 0;
            return 1;
        },

        searchPrefetch: function() {
            if (this.options.searchPrefetch !== undefined)
                return this.options.searchPrefetch;
            if (!this.searchEnabled() || this.options.source === undefined || $.isArray(this.options.source))
                return true;
            return false;
        },

        searchFirstOption: function() {
            if (this.options.searchFirstOption !== undefined)
                return this.options.searchFirstOption;
            return this.multiple();
        },

        _selectedOptions: function() {
            return this.element.find('option:selected');
        },

        _onfocus: function(evt) {
            if (!this._container.hasClass('selective-active')) {
                this._container.addClass('selective-active');
                if (this.multiple()) {
                    this._searchInput.val('');
                    this.openDropdown();
                }
            }
        },

        _onblur: function(evt) {
            this._container.removeClass('selective-active');
            this.closeDropdown();
            if (this.multiple()) {
                if (this._selectedOptions().length == 0)
                    this._searchInput.val(this.element.attr('title')||"");
                else
                    this._searchInput.val('');
                if (this._lastSearch != '') {
                    this.clearListItems();
                    this._lastSearch = undefined;
                }
            }
        },

        _onkeydown: function(evt) {
            if (evt.keyCode == 9)
                return true;
            if (alphanumericKeyCode(evt.keyCode)) {
                this.openDropdown();
                return true;
            }

            evt.stopPropagation();
            if (evt.keyCode == 27) {
                this.closeDropdown();
                this._container.focus();
                return false;
            } else if (!this.dropped()) {
                if (evt.keyCode == 13 || evt.keyCode == 32 || evt.keyCode == 40) {
                    this.openDropdown();
                }
                return false;
            } else {
                if (evt.keyCode == 38) {
                    this._highlightPrevListItem();
                    return false;
                } else if (evt.keyCode == 40) {
                    this._highlightNextListItem();
                } else if (evt.keyCode == 13) {
                    this._selectHighlightedItem(evt);
                }
                return false;
            }
            return true;
        },

        _searchKeydown: function(evt) {
            if (evt.keyCode == 9 || evt.keyCode == 27 || evt.keyCode == 38 ||
                evt.keyCode == 40 || evt.keyCode == 13)
            {
                this._pendingDelete = false;
                // bubble up
                return true;
            }
            evt.stopPropagation();
            if ((evt.keyCode == 8) && this._searchInput.val() == "") {
                var tag = this._control.find('.selective-tag:last');
                if (!this._pendingDelete) {
                    this._pendingDelete = true;
                    tag.addClass('selective-tag-focus');
                } else {
                    this._removeTag(tag);
                    this._pendingDelete = false;
                }
            } else if (alphanumericKeyCode(evt.keyCode) || evt.keyCode == 8) {
                this._pendingDelete = false;
                this.openDropdown();
                this._adjustSize();
                this._searchInputChanged();
            }
            return true;
        },

        dropped: function() {
            return this._container.hasClass('selective-dropped');
        },

        openDropdown: function() {
            if (this.dropped()) {
                this._searchInput.focus();
                return;
            }
            this._container.addClass('selective-dropped');
            this._adjustSize();
            this._dropdown.show();
            this._highlightSelectedListItem();
            if (this.searchEnabled()) {
                this._container.attr('tabindex', -1);
                this._searchInput.attr('tabindex', 0).focus();
            } else {
                this._searchInput.hide();
            }
            this._searchInputChanged();
        },

        closeDropdown: function() {
            if (!this.dropped())
                return;
            this._container.removeClass('selective-dropped');
            this._searchInput.attr('tabindex', -1);
            this._container.attr('tabindex', 0);
            if (this._container.hasClass('selective-active'))
                this._container.focus();
            this._dropdown.hide();
        },

        toggleDropdown: function() {
            if (!this.dropped()) {
                this.openDropdown();
            } else {
                this.closeDropdown();
            }
        },

        clearListItems: function() {
            this._itemList.empty();
            this._highlightedListItem = $([]);
        },

        _searchInputChanged: function() {
            var self = this;
            if (this._searchTimer)
                clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(function () {
                if (self.dropped())
                    self.search(self._searchInput.val());
            }, (this._lastSearch !== undefined)? this.options.searchDelay : 0);
        },

        search: function(term) {
            var self = this;

            if (this._lastSearch == term)
                return;
            this._lastSearch = term;

            if (term.length < this.searchMinLength()) {
                this.clearListItems();
                this._itemList.append(this._searchRequiredIndicator());
                return;
            }

            this._pendingSearchIndicator = this._searchingIndicator(term);

            var searchIndicatorDelay =
                (!this._searchIndicatorVisible && this._itemList.children().length > 0)?
                    this.options.searchIndicatorDelay : 0;

            if (this._searchIndicatorVisible) {
                displayIndicator();
            } else if (this._searchIndicatorTimer == undefined) {
                this._searchIndicatorTimer = setTimeout(
                        displayIndicator, this.options.searchIndicatorDelay);
            }

            if (this._currentSearch !== undefined)
                this._currentSearch.abort();

            var search = this._currentSearch = this._source(
                { term: term },
                function(response) {
                    searchComplete(function() {
                        self._createListItems(response, term);
                        self._highlightSelectedListItem();
                    });
                },
                function(message) {
                    searchComplete(function() { self._showErrorIndicator(message) });
                });

            function clearIndicatorTimer() {
                clearTimeout(self._searchIndicatorTimer);
                self._searchIndicatorTimer = undefined;
            }
            function displayIndicator() {
                clearIndicatorTimer();
                self.clearListItems();
                self._itemList.append(self._pendingSearchIndicator);
                self._pendingSearchIndicator = undefined;
                self._searchIndicatorVisible = new Date().getTime();
            }
            function searchComplete(handler) {
                if (self._currentSearch !== search)
                    return;
                var now = new Date().getTime();
                if (self._searchIndicatorVisible !== undefined &&
                    (now - self._searchIndicatorVisible) < self.options.searchIndicatorMinVisible)
                {
                    setTimeout(displayResults, self.options.searchIndicatorMinVisible
                            - (now - self._searchIndicatorVisible));
                } else {
                    displayResults();
                }
                function displayResults() {
                    if (self._currentSearch !== search)
                        return;
                    self._currentSearch = undefined;
                    clearIndicatorTimer();
                    self.clearListItems();
                    handler.call(self);
                    self._searchIndicatorVisible = undefined;
                }
            }
        },

        _searchRequiredIndicator: function() {
            var content = evaluateOrReturn.call(this, this.options.searchRequiredContent);
            return (content !== undefined)?
                    $('<li class="info" />').append(content) : undefined;
        },

        _searchingIndicator: function(term) {
            var content = evaluateOrReturn.call(this, this.options.searchMessageContent, term);
            return (content !== undefined)?
                    $('<li class="info" />').append(content) : undefined;
        },

        _noResultsIndicator: function(term) {
            var content = evaluateOrReturn.call(this, this.options.searchNoResultsContent, term);
            return (content !== undefined)?
                    $('<li class="no-results" />').append(content) : undefined;
        },

        _showErrorIndicator: function(text) {
            this.clearListItems();
            if (text)
                this._itemList.append($('<li class="error" />').text(text));
        },

        _createListItems: function(items, term) {
            var self = this;

            if (items.length == 0) {
                this._itemList.append(this._noResultsIndicator(term));
                return;
            }

            this.options.renderList.call(this, this._itemList,
                $.map(items, function(item) {
                    // ensure value is a string
                    return $.extend({}, item, {
                        value: item.value + ''
                    });
                })
            );

            var selectedValues = this._selectedOptions().map(function() {
                return optionValue($(this));
            }).get();

            this._itemList.find('.item:not(.disabled)').mousemove(function() {
                self._highlightListItem($(this));
            }).click(function(evt) {
                self._highlightListItem($(this));
                self._selectListItem($(this), evt);
            }).mouseup(function(evt) {
                if (!self._mouseDragActive)
                    return true;
                self._highlightListItem($(this));
                self._selectListItem($(this), evt);
            }).each(function() {
                var item = $(this).data('selective.item');
                if (item && $.inArray(item.value, selectedValues) >= 0)
                    $(this).addClass('selected');
            });
        },

        _renderList: function(ul, items) {
            var self = this;
            renderListAtDepth(ul, items, 0);

            function renderListAtDepth(ul, items, depth) {
                $.each(items, function(idx, item) {
                    var li = self.options.renderItem.call(
                        self, $('<li class="item" />'), item, depth);
                    if (li != undefined) {
                        li.data('selective.item', item);
                        ul.append(li);
                        if (item.children)
                            renderListAtDepth(ul, item.children, depth+1);
                    }
                });
            }
        },

        _renderItem: function(li, item, depth) {
            if (depth > 0)
                li.addClass('grouped');
            if (item.children)
                li.addClass('group');
            if (item.disabled)
                li.addClass('disabled');
            return li.text(item.label || item.value);
        },

        _highlightListItem: function(listItem) {
            this._highlightedListItem.removeClass('highlighted');
            this._highlightedListItem = listItem.addClass('highlighted');
            if ((this._itemList.has(listItem).length == 0) || !this.dropped())
                return;
            var listTop = this._itemList.scrollTop();
            var listBottom = listTop + this._itemList.height();
            var itemTop = listItem.position().top + listTop;
            var itemBottom = itemTop + listItem.outerHeight();
            if (itemTop < listTop) {
                this._itemList.scrollTop(itemTop);
            } else if (itemBottom >= listBottom) {
                var offset = itemBottom - this._itemList.height();
                this._itemList.scrollTop((offset > 0)? offset : 0);
            }
        },

        _highlightNextListItem: function() {
            var next = (this._highlightedListItem.length)?
                    this._highlightedListItem.nextAll('.item:not(.disabled):first') :
                    this._itemList.children('.item:not(.disabled):first');
            if (next.length == 0)
                return;
            this._highlightListItem(next);
        },

        _highlightPrevListItem: function() {
            this._highlightListItem(this._highlightedListItem.prevAll('.item:not(.disabled):first'));
        },

        _highlightSelectedListItem: function() {
            var selectedListItem = this._itemList.children('.item.selected:not(.disabled):first');
            this._highlightListItem(selectedListItem.length?
                    selectedListItem : this._itemList.children('.item:not(.disabled):first'));
        },

        select: function(item, dontClose) {
            if (!this.multiple())
                this._deselectOptions(this._selectedOptions());

            var selectedlabel = item.selectedlabel || item.label || item.text;
            var option = $('<option selected="selected" />')
                    .val(item.value).text(selectedlabel);
            this.element.append(option);

            this._itemList.children('.item:not(.disabled)').each(function() {
                var otherItem = $(this).data('selective.item');
                if (otherItem && otherItem.value == item.value)
                    $(this).addClass('selected');
            });

            if (this.multiple()) {
                this._control.children(':last').before(this._createTag(selectedlabel, item.value, 0));
                this._searchInput.val('');
            } else {
                this._control.find('span').text(selectedlabel)
            }

            if (this.multiple() || dontClose)
                this._searchInput.focus();
            else
                this.closeDropdown();

            this._trigger('selectedOption', 0, { elem: option.get(0), item: item });
            this._adjustSize();
        },

        _selectHighlightedItem: function(evt) {
            if (this._highlightedListItem && this._highlightedListItem.length)
                this._selectListItem(this._highlightedListItem, evt);
            else
                this.closeDropdown();
        },

        _selectListItem: function(listItem, evt) {
            if (listItem.hasClass('selected'))
                return;

            var item = listItem.data('selective.item');
            if (!item)
                return;

            this.select(item, evt.metaKey);
        },

        deselect: function(item) {
            this._deselectOptions(this._selectedOptions().filter(function() {
                return (item.value == optionValue($(this)));
            }));
            this._searchInput.focus();
            this._adjustSize();
        },

        _deselectOptions: function(options) {
            var self = this;
            options.each(function() {
                var option = $(this);
                var value = optionValue(option);

                self._itemList.children('.item.selected').each(function() {
                    var item = $(this);
                    var itemData = item.data('selective.item');
                    if (value == itemData.value) {
                        item.removeClass('selected');
                    }
                });
                self._trigger('deselectedOption', 0, { elem: this, item: {value: value} });
                option.remove();
            });
        },

        _createTag: function(content, value) {
            var self = this;
            var tag = $('<li class="selective-tag" />').data('selective.value', value);
            var removeLink = $('<a class="selective-deselect" />').mousedown(function(evt) {
                evt.stopPropagation();
            }).click(function() {
                self._removeTag(tag);
                return false;
            });
            return tag.append($('<span />').append(content)).append(removeLink);
        },

        _removeTag: function(tag) {
            var value = tag.data('selective.value');
            tag.remove();
            this.deselect({value: value});
        },

        _adjustSize: function() {
            var self = this;

            var ddWidth = this._elemWidth - borderPadding(this._dropdown);
            this._container.css({ 'width': this._elemWidth + 'px' });

            if (!this.multiple()) {
                this._searchInput.css({
                    'width': (ddWidth - borderPadding(this._search) - borderPadding(this._searchInput)) + 'px'
                });
            } else if (this._selectedOptions().length == 0) {
                this._searchInput.css('width', (this._elemWidth - 10) + 'px');
            } else {
                var div = $('<div />').css({
                    'position': 'absolute',
                    'left': '-1000px',
                    'top': '-1000px',
                    'display': 'none'
                }).text(this._searchInput.val());

                $.map(['font-size','font-style','font-weight','font-family','line-height','text-transform','letter-spacing'], function(prop) {
                    div.css(prop, self._searchInput.css(prop));
                });

                $('body').append(div);
                var width = div.width() + 25;
                div.remove();

                if (width > this._elemWidth - 10)
                    width = this._elemWidth - 10;

                this._searchInput.css('width', width + 'px');
            }

            this._dropdown.css({
                'width': ddWidth + 'px',
                'top': (this._container.height() - (this.multiple()? 0 : 1)) + 'px'
            });
        },

        animateElipses: function(elems) {
            return $(elems).each(function() {
                var elem = $(this);
                var initial = elem.text()||"";
                var dots = "..";
                var update = function() {
                    dots = (dots == "...")? "." : dots + '.';
                    elem.delay(500).queue(update);
                    elem.text(initial + dots).dequeue()
                };
                elem.queue(update);
            });
        }
    });

    function optionValue(option) {
        return firstDefined(option.val(), option.text());
    }

    function firstDefined() {
        var result = undefined;
        $.each(arguments, function(idx, arg) {
            result = arg;
            return (result === undefined);
        });
        return result;
    }

    function borderPadding(elem) {
        return elem.outerWidth() - elem.width();
    }

    function delayedProxy(callback, delay) {
        return function() {
            var context = this;
            var callbackArgs = arguments;
            setTimeout(function() {
                callback.apply(context, callbackArgs);
            }, delay);
        };
    }

    function evaluateOrReturn(obj) {
        if ($.isFunction(obj))
            return obj.apply(this, Array.prototype.splice.call(arguments, 1));
        return obj;
    }

    function alphanumericKeyCode(keyCode) {
        return ((keyCode >= 48 && keyCode <= 90) || (keyCode >= 96 && keyCode <= 111) ||
                (keyCode >= 186 && keyCode <= 191) || (keyCode >= 219 && keyCode <= 222));
    }

    function escapeRegex(regex) {
        return regex.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }

    function filterItems(items, term) {
        return deepMap(items, new RegExp(escapeRegex(term), "i"));

        function deepMap(items, matcher) {
            return $.map(items, function(item) {
                if (matcher.test(item.label || item.value))
                    return item;
                if (item.children) {
                    var matchedChildren = deepMap(item.children, matcher);
                    if (matchedChildren.length == 0)
                        return null;
                    return $.extend({},item,{children: matchedChildren});
                }
            });
        }
    }

    function arrayFromSelect(elems, skipFirst) {
        return elems.children('option' + (skipFirst? ':not(:first-child)':'') + ',optgroup').map(function() {
            var elem = $(this);
            if (elem.attr('disabled'))
                return null;
            return (elem.is('option'))? {
                value: elem.val(),
                label: elem.text(),
                selected: elem.attr('selected')
            } : { label: elem.attr('label')||"", disabled: true, children: arrayFromSelect(elem, false) };
        }).get();
    }

})(jQuery, document);
