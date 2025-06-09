
  {/* Swiper Container avec card glassmorphism */}
            <div className="swiper-container min-h-[400px] sl2:min-h-[450px] sm:h-[500px] relative mb-6">
                <div className="bg-white/10 dark:bg-gray-800/20 backdrop-blur-md rounded-xl sl2:rounded-2xl 
                          border border-white/20 dark:border-gray-700/30 p-4 sl2:p-6 sm:p-8 h-full
                          shadow-xl shadow-black/5 dark:shadow-black/20">
                    <Swiper
                        onSwiper={setSwiper}
                        onActiveIndexChange={(s) => {
                            setActiveIndex(s.activeIndex);
                            if (s.previousIndex !== undefined && validateStep(s.previousIndex)) {
                                setMaxReachedIndex(prev => Math.max(prev, s.previousIndex + 1));
                            }
                        }}
                        className={`h-full ${createStoreMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
                        allowTouchMove={false}
                        modules={[Navigation]}
                    >
                        {/* Slide 1: Nom avec design amélioré */}
                        <SwiperSlide className="flex flex-col justify-center items-center h-full gap-4  sl2:gap-6 px-2 sl2:px-4 text-center">
                            <div className="flex flex-col items-center gap-2 sl2:gap-3">

                                <h2 className="text-base sl2:text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">
                                    {t('storeCreate.stepNameTitle')}
                                </h2>
                                <p className="text-xs mt-4 sl2:text-sm text-gray-600 dark:text-gray-400 max-w-sm">
                                    Choisissez un nom unique pour votre boutique
                                </p>
                            </div>

                            <div className="w-full mt-4 mx-auto max-w-xs sl2:max-w-sm flex flex-col items-center">
                                <label htmlFor="input-store-name" className="sr-only">{t('storeCreate.nameLabel')}</label>
                                <input
                                    ref={nameInputRef}
                                    id="input-store-name"
                                    name="name"
                                    type="text"
                                    autoFocus
                                    className={`w-full px-3 sl2:px-4 py-2 sl2:py-3 
                                          bg-white/20 dark:bg-gray-800/30 backdrop-blur-sm
                                          border rounded-lg sl2:rounded-xl shadow-sm 
                                          text-sm sl2:text-base placeholder-gray-500 dark:placeholder-gray-400
                                          focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200
                                          ${nameCheck.type === 'invalid'
                                            ? 'border-red-400 dark:border-red-500 ring-red-300 dark:ring-red-400 focus:ring-red-400 focus:border-red-500'
                                            : nameCheck.type === 'valid'
                                                ? 'border-green-400 dark:border-green-500 ring-green-300 dark:ring-green-400 focus:ring-green-400 focus:border-green-500'
                                                : 'border-white/30 dark:border-gray-600/40 focus:border-green-400 dark:focus:border-green-500 focus:ring-green-400'
                                        }`}
                                    placeholder={t('storeCreate.namePlaceholder')}
                                    value={collected.name || ''}
                                    onChange={handleInputChange}
                                    onKeyUp={(e) => e.key === 'Enter' && isNameValid && swiper?.slideNext()}
                                />

                                <div className="w-full flex justify-between mt-2 px-1">
                                    <span className={`text-xs flex-1 ${nameCheck.type === 'invalid'
                                        ? 'text-red-500 dark:text-red-400'
                                        : nameCheck.type === 'valid'
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-gray-500 dark:text-gray-400'}`}>
                                        {isCheckingName ? (
                                            <span className="italic flex items-center gap-1">
                                                <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                                {t('storeCreate.validation.nameChecking')}...
                                            </span>
                                        ) : nameCheck.message}
                                    </span>
                                    <span className={`text-xs font-medium ${collected.name.length > 32
                                        ? 'text-red-500 dark:text-red-400'
                                        : 'text-gray-400 dark:text-gray-500'}`}>
                                        {collected.name.length}/32
                                    </span>
                                </div>
                            </div>
                        </SwiperSlide>

                        {/* Slide 2: Logo avec design moderne */}
                        <SwiperSlide className="flex flex-col justify-center items-center h-full gap-4 sl2:gap-6 px-2 sl2:px-4 text-center">
                            <div className="flex flex-col items-center gap-2 sl2:gap-3">

                                <h2 className="text-base sl2:text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">
                                    {t('storeCreate.stepLogoTitle')}
                                </h2>
                                <p className="text-xs sl2:text-sm text-gray-600 dark:text-gray-400 max-w-sm">
                                    Ajoutez un logo pour représenter votre marque
                                </p>
                            </div>

                            <label htmlFor="store-logo-input"
                                className={`relative group cursor-pointer flex flex-col items-center justify-center 
                                         w-32 h-32 sl2:w-36 sl2:h-36 sm:w-40 sm:h-40 
                                         rounded-full overflow-hidden transition-all duration-300
                                         bg-white/10 dark:bg-gray-800/20 backdrop-blur-sm
                                         border-2 border-dashed hover:border-solid
                                         ${logoError
                                        ? 'border-red-400 dark:border-red-500'
                                        : 'border-white/30 dark:border-gray-600/40 hover:border-blue-400 dark:hover:border-blue-500'} 
                                         hover:bg-white/20 dark:hover:bg-gray-700/30`}>
                                <img
                                    src={logoPreview || '/res/empty/drag-and-drop.png'}
                                    alt={t('storeCreate.logoLabel')}
                                    className={`w-full h-full transition-all duration-300 ${collected.logo.length > 0
                                        ? 'object-contain p-2'
                                        : 'object-contain opacity-40 dark:opacity-30 group-hover:opacity-60'}`}
                                    onError={(e) => (e.currentTarget.src = '/res/empty/drag-and-drop.png')}
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent 
                                          flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                                    <div className="flex flex-col items-center gap-1 text-white">
                                        <IoPencil className="w-5 h-5 sl2:w-6 sl2:h-6" />
                                        <span className="text-xs font-medium">Modifier</span>
                                    </div>
                                </div>
                                <input id="store-logo-input" name="logo" type="file" accept="image/*" className="hidden"
                                    onChange={(e) => handleFileChange(e, 'logo')} />
                            </label>

                            {logoError && (
                                <p className="text-xs text-red-500 dark:text-red-400 bg-red-50/50 dark:bg-red-900/20 
                                         px-3 py-1 rounded-lg border border-red-200/50 dark:border-red-800/30">
                                    {logoError}
                                </p>
                            )}

                            <p className="text-xs text-gray-500 dark:text-gray-400 px-4 max-w-sm text-center leading-relaxed">
                                {t('storeCreate.logoHelpText')}
                            </p>
                        </SwiperSlide>

                        {/* Slide 3: Cover Image avec design amélioré */}
                        <SwiperSlide className="flex flex-col justify-center items-center h-full gap-4 sl2:gap-6 px-2 sl2:px-4 text-center">
                            <div className="flex flex-col items-center gap-2 sl2:gap-3">

                                <h2 className="text-base sl2:text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">
                                    {t('storeCreate.stepCoverTitle')}
                                </h2>
                                <p className="text-xs sl2:text-sm text-gray-600 dark:text-gray-400 max-w-sm">
                                    Image de couverture de votre boutique
                                </p>
                            </div>

                            <label htmlFor="store-cover_image-input"
                                className={`relative group cursor-pointer w-full max-w-xs sl2:max-w-sm 
                                         aspect-video rounded-lg sl2:rounded-xl overflow-hidden transition-all duration-300
                                         bg-white/10 dark:bg-gray-800/20 backdrop-blur-sm
                                         border-2 border-dashed hover:border-solid
                                         ${coverError
                                        ? 'border-red-400 dark:border-red-500'
                                        : 'border-white/30 dark:border-gray-600/40 hover:border-purple-400 dark:hover:border-purple-500'} 
                                         hover:bg-white/20 dark:hover:bg-gray-700/30`}>
                                <div
                                    style={{
                                        background: getMedia({
                                            isBackground: true,
                                            source: coverPreview || '/res/empty/drag-and-drop.png'
                                        })
                                    }}
                                    className={`w-full h-full bg-cover bg-center transition-all duration-300 ${collected.cover_image.length > 0
                                        ? ''
                                        : 'opacity-40 dark:opacity-30 group-hover:opacity-60'}`}
                                    onError={(e) => {
                                        e.currentTarget.style.background = getMedia({
                                            isBackground: true,
                                            source: '/res/empty/drag-and-drop.png'
                                        })
                                    }}
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent 
                                          flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                                    <div className="flex flex-col items-center gap-1 text-white">
                                        <IoPencil className="w-6 h-6 sl2:w-7 sl2:h-7" />
                                        <span className="text-xs sl2:text-sm font-medium">Modifier</span>
                                    </div>
                                </div>
                                <input id="store-cover_image-input" name="cover_image" type="file" accept="image/*" className="hidden"
                                    onChange={(e) => handleFileChange(e, 'cover_image')} />
                            </label>

                            {coverError && (
                                <p className="text-xs text-red-500 dark:text-red-400 bg-red-50/50 dark:bg-red-900/20 
                                         px-3 py-1 rounded-lg border border-red-200/50 dark:border-red-800/30">
                                    {coverError}
                                </p>
                            )}

                            <p className="text-xs text-gray-500 dark:text-gray-400 px-4 max-w-sm text-center leading-relaxed">
                                {t('storeCreate.coverHelpText')}
                            </p>
                        </SwiperSlide>

                        {/* Slide 4: Infos avec design moderne */}
                        <SwiperSlide className="flex flex-col justify-center items-center h-full gap-4 sl2:gap-6 px-2 sl2:px-4 text-center overflow-y-auto">
                            <div className="flex flex-col items-center gap-2 sl2:gap-3">

                                <h2 className="text-base sl2:text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">
                                    {t('storeCreate.stepInfoTitle')}
                                </h2>
                            </div>

                            <div className="w-full max-w-xs sl2:max-w-sm flex flex-col gap-3 sl2:gap-4">
                                {/* Titre */}
                                <div>
                                    <label htmlFor="input-store-title"
                                        className="flex justify-between items-center text-xs sl2:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        <span>{t('storeCreate.titleLabel')}</span>
                                        <span className={`text-xs ${collected.title.length > 52
                                            ? 'text-red-500 dark:text-red-400'
                                            : 'text-gray-400 dark:text-gray-500'}`}>
                                            {collected.title.length}/52
                                        </span>
                                    </label>
                                    <input
                                        ref={titleInputRef}
                                        id="input-store-title"
                                        name="title"
                                        type="text"
                                        className={`block w-full px-3 sl2:px-4 py-2 sl2:py-3 
                                              bg-white/20 dark:bg-gray-800/30 backdrop-blur-sm
                                              rounded-lg sl2:rounded-xl border text-sm sl2:text-base
                                              placeholder-gray-500 dark:placeholder-gray-400
                                              focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200
                                              ${titleError
                                                ? 'border-red-400 dark:border-red-500 focus:ring-red-400 focus:border-red-500'
                                                : 'border-white/30 dark:border-gray-600/40 focus:border-green-400 dark:focus:border-green-500 focus:ring-green-400'}`}
                                        placeholder={t('storeCreate.titlePlaceholder')}
                                        value={collected.title || ''}
                                        onChange={handleInputChange}
                                        onKeyUp={(e) => e.key === 'Enter' && descriptionInputRef.current?.focus()}
                                    />
                                    {titleError && (
                                        <p className="mt-1 text-xs text-red-500 dark:text-red-400">{titleError}</p>
                                    )}
                                </div>

                                {/* Description */}
                                <div>
                                    <label htmlFor="input-store-description"
                                        className="flex justify-between items-center text-xs sl2:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        <span>{t('storeCreate.descriptionLabel')}</span>
                                        <span className={`text-xs ${collected.description.length > 128
                                            ? 'text-red-500 dark:text-red-400'
                                            : 'text-gray-400 dark:text-gray-500'}`}>
                                            {collected.description.length}/128
                                        </span>
                                    </label>
                                    <textarea
                                        ref={descriptionInputRef}
                                        id="input-store-description"
                                        name="description"
                                        rows={3}
                                        className={`block w-full px-3 sl2:px-4 py-2 sl2:py-3 
                                              bg-white/20 dark:bg-gray-800/30 backdrop-blur-sm
                                              rounded-lg sl2:rounded-xl border text-sm sl2:text-base
                                              placeholder-gray-500 dark:placeholder-gray-400 resize-none
                                              focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200
                                              ${descriptionError
                                                ? 'border-red-400 dark:border-red-500 focus:ring-red-400 focus:border-red-500'
                                                : 'border-white/30 dark:border-gray-600/40 focus:border-green-400 dark:focus:border-green-500 focus:ring-green-400'}`}
                                        placeholder={t('storeCreate.descriptionPlaceholder')}
                                        value={collected.description || ''}
                                        onChange={handleInputChange}
                                    />
                                    {descriptionError && (
                                        <p className="mt-1 text-xs text-red-500 dark:text-red-400">{descriptionError}</p>
                                    )}
                                </div>
                            </div>

                            {/* Google Preview avec design amélioré */}
                            <div className="mt-4 w-full max-w-xs sl2:max-w-sm 
                                      bg-white/20 dark:bg-gray-800/30 backdrop-blur-sm
                                      border border-white/30 dark:border-gray-600/40 
                                      rounded-lg sl2:rounded-xl p-3 sl2:p-4 text-left">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                                    <IoSearch className="w-3 h-3" />
                                    {t('storeCreate.googlePreviewLabel')}
                                </p>
                                <div className="flex items-start gap-2 sl2:gap-3">
                                    <div className="w-10 h-10 sl2:w-12 sl2:h-12 rounded-full bg-cover bg-center 
                                              bg-white/20 dark:bg-gray-700/30 flex-shrink-0 flex items-center justify-center
                                              border border-white/20 dark:border-gray-600/30"
                                        style={{ backgroundImage: logoPreview ? `url(${logoPreview})` : 'none' }}>
                                        {!logoPreview && (
                                            <IoStorefront className="w-4 h-4 sl2:w-5 sl2:h-5 text-gray-400 dark:text-gray-500" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-xs sl2:text-sm font-medium text-blue-700 dark:text-blue-400 leading-tight truncate">
                                            {collected.title || t('storeCreate.previewDefaultTitle')}
                                        </h3>
                                        <p className="text-xs text-green-700 dark:text-green-400 truncate">
                                            https://{collected.name || 'votrenom'}.sublymus.com
                                        </p>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                                    {collected.description || t('storeCreate.previewDefaultDesc')}
                                </p>
                            </div>
                        </SwiperSlide>
                    </Swiper>
                </div>
            </div>

            {/* Boutons de navigation avec design moderne */}
            <div className="flex justify-between items-center w-full max-w-xs sl2:max-w-sm sm:max-w-md mx-auto">
                {/* Bouton Retour/Annuler */}
                <button
                    type="button"
                    onClick={handleBack}
                    className={`inline-flex items-center gap-1 sl2:gap-1.5 px-3 sl2:px-4 py-2 sl2:py-2.5 
                          rounded-lg sl2:rounded-xl text-xs sl2:text-sm font-medium 
                          transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0
                          ${(activeIndex === 0 && !canCancel)
                            ? 'invisible'
                            : 'bg-white/20 dark:bg-gray-800/30 backdrop-blur-sm text-gray-700 dark:text-gray-300 border border-white/30 dark:border-gray-600/40 hover:bg-white/30 dark:hover:bg-gray-700/40 focus:ring-gray-400'
                        }`}
                >
                    <IoChevronBack className="w-3 h-3 sl2:w-4 sl2:h-4" />
                    {activeIndex === 0 && canCancel ? t('common.cancel') : t('common.back')}
                </button>

                {/* Bouton Suivant/Créer */}
                <button
                    type="button"
                    onClick={handleNext}
                    disabled={!validateStep(activeIndex) || createStoreMutation.isPending}
                    className={`inline-flex items-center gap-1 sl2:gap-1.5 px-4 sl2:px-5 py-2 sl2:py-2.5 
                          rounded-lg sl2:rounded-xl text-xs sl2:text-sm font-medium 
                          transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0
                          ${(!validateStep(activeIndex) || createStoreMutation.isPending)
                            ? 'bg-gray-300/50 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400 cursor-not-allowed border border-gray-300/30 dark:border-gray-600/20'
                            : 'bg-green-500/90 dark:bg-green-600/90 text-white hover:bg-green-600 dark:hover:bg-green-500 focus:ring-green-400 shadow-lg shadow-green-500/25 dark:shadow-green-600/20'
                        }`}
                >
                    {/* Afficher texte conditionnel */}
                    {createStoreMutation.isPending ? t('common.creating') : (activeIndex === 3 ? (isEditing ? t('common.saveChanges') : t('common.create')) : t('common.next'))}
                    <IoChevronForward />
                </button>
            </div>
